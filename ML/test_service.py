"""Run: python test_service.py   (or pytest). Tests the core logic; no FastAPI needed."""
import copy, os, time, json, math
os.environ["TODAY_OVERRIDE"] = "2026-10-03"   # data is as of 2026-10-01
from service_core import ForecastService, ApiError, validate_response

svc = ForecastService()
TODAY = __import__("datetime").date(2026, 10, 3)


def raises(code, **kw):
    try:
        svc.forecast(**kw)
    except ApiError as e:
        assert e.code == code, (e.code, code); return e
    raise AssertionError(f"expected {code}")


def test_valid_response_passes_contract_checks():
    for t in (7, 30, 90, 365):
        r = svc.forecast("^NSEI", t, 10, 50)
        assert validate_response(r, t, today=TODAY) == [], t
        assert r["tradingDays"] == round(t * 252 / 365)
        assert len(r["samplePaths"]) == 50


def test_range_and_input_rejections():
    for t in (6, 0, -5, 366, 1095):
        assert raises("INVALID_REQUEST", underlying="^NSEI", tenor_days=t).status == 422
    assert raises("UNSUPPORTED_UNDERLYING", underlying="AAPL", tenor_days=90).status == 400
    raises("INVALID_REQUEST", underlying="^NSEI", tenor_days=90, training_window_years=2)
    raises("INVALID_REQUEST", underlying="^NSEI", tenor_days=90, n_sample_paths=5000)


def test_stale_data_rejected():
    os.environ["TODAY_OVERRIDE"] = "2026-11-15"
    try: assert raises("DATA_STALE", underlying="^NSEI", tenor_days=90).status == 503
    finally: os.environ["TODAY_OVERRIDE"] = "2026-10-03"


def test_cached_fit_and_latency():
    svc.forecast("^NSEI", 30, 10, 0)
    t = time.time(); r = svc.forecast("^NSEI", 365, 10, 500); dt = time.time() - t
    assert dt < 10, dt
    print(f"  365d, 500 sample paths: {dt:.2f}s, {len(json.dumps(r))/1e6:.2f} MB JSON")


def test_reproducible():
    a = svc.forecast("^NSEI", 180, 10, 0); b = svc.forecast("^NSEI", 180, 10, 0)
    assert a["cases"] == b["cases"]


def test_validator_catches_bad_output():
    good = svc.forecast("^NSEI", 90, 10, 5); t = 90
    def bad(f):
        r = copy.deepcopy(good); f(r); return validate_response(r, t, today=TODAY)
    assert bad(lambda r: r["cases"]["low"]["path"].pop())                                  # wrong length
    assert bad(lambda r: r["cases"]["base"]["path"].__setitem__(3, float("nan")))          # NaN
    assert bad(lambda r: r["fan"]["p50"].__setitem__(2, -1.0))                             # non-positive
    assert bad(lambda r: r["cases"]["low"].__setitem__("finalValue", 99999.0))             # order
    assert bad(lambda r: r["fan"]["p5"].__setitem__(5, 99999.0))                           # fan order
    assert bad(lambda r: r.__setitem__("tradingDays", 10))                                 # mismatch
    assert bad(lambda r: r.pop("cases"))                                                   # malformed
    assert validate_response(good, t, today=__import__("datetime").date(2026, 12, 1))      # stale


def test_model_card_and_health():
    m = svc.model_card()
    assert m["supportedTenorDays"] == {"min": 7, "max": 365} and len(m["backtest"]["results"]) == 13
    assert svc.health()["dataAsOf"] == "2026-10-01"


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f(); print("PASS", n)
