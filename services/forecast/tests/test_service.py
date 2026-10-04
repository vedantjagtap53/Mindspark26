"""Run from services/forecast: pytest. Needs requirements-dev.txt for the HTTP tests."""
import copy, datetime as dt, math, os, shutil, tempfile, time
from pathlib import Path
import numpy as np
from forecast_service import model as nm
from forecast_service.contract import validate_response
from forecast_service.service import ApiError, ForecastService

TODAY = dt.date(2026, 10, 3)            # data is as of 2026-10-01
svc = ForecastService(today=lambda: TODAY)


def req(tenor, samples=100, window=10):
    return dict(symbol="^NSEI", tenorDays=tenor, samplePathCount=samples, trainingWindowYears=window)


def run(tenor, samples=100, window=10):
    return svc.forecast("^NSEI", "index", tenor, window, samples)


def raises(code, *args):
    try:
        svc.forecast(*args)
    except ApiError as e:
        assert e.code == code, (e.code, code)
        return e
    raise AssertionError(f"expected {code}")


# ---- contract v1.0 ----
def test_contract_v1_for_every_supported_tenor_edge():
    for t in (30, 90, 182, 365, 730, 1095):
        r = run(t)
        assert validate_response(r, req(t), TODAY) == [], t
        assert r["horizon"]["tradingDays"] == round(t * 252 / 365)
        assert len(r["cases"]["base"]["path"]) == r["horizon"]["tradingDays"] + 1


def test_every_series_starts_at_spot():
    r = run(182)
    spot = r["data"]["spot"]
    assert spot == round(float(svc.df.Close.iloc[-1]), 2)
    series = [r["cases"][k]["path"] for k in ("low", "base", "high")] + list(r["fan"].values()) + r["samplePaths"]
    assert all(s[0] == spot for s in series)


def test_metadata_fields():
    r = run(182, window=5)
    assert r["contractVersion"] == "1.0" and r["model"]["simulations"] >= 10000
    assert r["model"]["drift"] == {"method": "fixed", "annualized": 0.0756}
    assert r["data"]["trainingStart"] < r["data"]["trainingEnd"] == r["data"]["asOf"] == "2026-10-01"
    assert r["data"]["observations"] > 1000
    bt = r["backtest"]
    assert bt["horizonTradingDays"] == 124 and 0 <= bt["bandCoverage"] <= 1 and bt["baseMape"] < 1


def test_terminal_quantiles_match_case_finals():
    r = run(365)
    q = r["terminalQuantiles"]
    for k, p in (("low", "p5"), ("base", "p50"), ("high", "p95")):
        assert abs(r["cases"][k]["path"][-1] / q[p] - 1) < 0.002


def test_rejections():
    for t in (29, 0, -5, 1096):
        assert raises("INVALID_REQUEST", "^NSEI", "index", t).status == 422
    assert raises("UNSUPPORTED_UNDERLYING", "AAPL", "equity", 90).status == 400
    assert raises("UNSUPPORTED_UNDERLYING", "^NSEI", "fx", 90).status == 400
    raises("INVALID_REQUEST", "^NSEI", "index", 90, 7)
    raises("INVALID_REQUEST", "^NSEI", "index", 90, 10, 99)
    raises("INVALID_REQUEST", "^NSEI", "index", 90, 10, 2001)


def test_stale_data_rejected_after_5_days():
    s = ForecastService(today=lambda: dt.date(2026, 10, 7))
    try:
        s.forecast("^NSEI", "index", 90)
        raise AssertionError("expected DATA_STALE")
    except ApiError as e:
        assert e.code == "DATA_STALE" and e.status == 503
    assert s.health()["status"] == "stale"
    assert ForecastService(today=lambda: dt.date(2026, 10, 6)).forecast("^NSEI", "index", 90)


def test_reloads_csv_when_file_changes():
    tmp = Path(tempfile.mkdtemp())
    try:
        src = Path(svc.cfg["data_path"]); dst = tmp / "data.csv"
        lines = src.read_text().splitlines()
        dst.write_text("\n".join(lines[:-1]) + "\n")          # drop the last day
        os.environ["DATA_PATH"] = str(dst)
        s = ForecastService(today=lambda: TODAY)
        assert str(s.as_of) == "2026-09-30"
        dst.write_text("\n".join(lines) + "\n")               # refresh job appends a day
        os.utime(dst, (time.time() + 5, time.time() + 5))
        assert s.forecast("^NSEI", "index", 90)["data"]["asOf"] == "2026-10-01"
    finally:
        os.environ.pop("DATA_PATH", None); shutil.rmtree(tmp, ignore_errors=True)


# ---- model ----
def test_h_next_is_one_step_ahead_of_the_likelihood_recursion():
    lr = (np.log(svc.df.Close).diff().dropna() * 100).values[-2500:]
    p = nm.fit_garch(lr)
    e = lr - p["mu"]; h = lr.var()
    for t in range(1, len(lr)): h = p["omega"] + p["alpha"] * e[t - 1] ** 2 + p["beta"] * h
    expected = p["omega"] + p["alpha"] * e[-1] ** 2 + p["beta"] * h
    assert math.isclose(p["h_next"], expected, rel_tol=1e-12)


def test_reproducible_and_fast():
    a = run(1095, 500); t = time.time(); b = run(1095, 500); took = time.time() - t
    assert a["cases"] == b["cases"] and took < 10, took


def test_validator_catches_bad_output():
    good = run(90, 100)
    def bad(f):
        r = copy.deepcopy(good); f(r); return validate_response(r, req(90, 100), TODAY)
    assert bad(lambda r: r["cases"]["low"]["path"].pop())
    assert bad(lambda r: r["cases"]["base"]["path"].__setitem__(3, float("nan")))
    assert bad(lambda r: r["fan"]["p50"].__setitem__(2, -1.0))
    assert bad(lambda r: r["cases"]["base"]["path"].__setitem__(0, 1.0))           # not starting at spot
    assert bad(lambda r: r["cases"]["low"]["path"].__setitem__(-1, 99999.0))       # order
    assert bad(lambda r: r["horizon"].__setitem__("tradingDays", 10))
    assert bad(lambda r: r.__setitem__("contractVersion", "1.1"))
    assert bad(lambda r: r.pop("cases"))
    assert validate_response(good, req(90, 100), dt.date(2026, 12, 1))              # stale


def test_model_card_and_health():
    m = svc.model_card()
    assert m["supportedTenorDays"] == {"min": 30, "max": 1095} and len(m["backtest"]["results"]) == 13
    assert svc.health() == {"status": "ok", "dataAsOf": "2026-10-01", "modelFitAt": svc.model_fit_at}


# ---- HTTP (needs fastapi + httpx) ----
def _client():
    from fastapi.testclient import TestClient
    from forecast_service import api as appmod
    return TestClient(appmod.app, raise_server_exceptions=False)


def test_http_auth_and_strict_request():
    os.environ["FORECAST_API_KEY"] = "test-key"; os.environ.pop("FORECAST_ALLOW_UNAUTHENTICATED", None)
    body = {"underlying": {"symbol": "^NSEI", "assetClass": "index"}, "tenorDays": 182, "samplePathCount": 100}
    from forecast_service import api as appmod
    try:
        with _client() as c:
            appmod.svc._today = lambda: TODAY
            auth = {"Authorization": "Bearer test-key"}
            ok = c.post("/v1/forecast", json=body, headers=auth)
            assert ok.status_code == 200 and validate_response(ok.json(), req(182), TODAY) == []
            assert c.post("/v1/forecast", json=body).status_code == 401
            assert c.post("/v1/forecast", json=body, headers={"Authorization": "Bearer wrong"}).status_code == 401
            assert c.get("/v1/model-card").status_code == 401
            assert c.get("/v1/health").status_code == 200
            for bad in ({**body, "tenorDays": "182"}, {**body, "tenorDays": 182.5}, {**body, "extra": 1},
                        {**body, "underlying": "^NSEI"}, {**body, "trainingWindowYears": 7}):
                r = c.post("/v1/forecast", json=bad, headers=auth)
                assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_REQUEST", bad
    finally:
        os.environ.pop("FORECAST_API_KEY", None)


def test_http_refuses_to_start_without_a_key():
    os.environ.pop("FORECAST_API_KEY", None); os.environ.pop("FORECAST_ALLOW_UNAUTHENTICATED", None)
    try:
        with _client():
            raise AssertionError("started without FORECAST_API_KEY")
    except RuntimeError as e:
        assert "FORECAST_API_KEY" in str(e)

