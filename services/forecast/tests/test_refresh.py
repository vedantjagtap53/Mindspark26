"""Run from services/forecast: pytest. Uses a temp copy of the CSV and a fake Upstox."""
import datetime as dt, math, os, shutil, tempfile
from pathlib import Path
import pandas as pd
from forecast_service import refresh as rd
from forecast_service.config import DEFAULT_DATA_PATH
from forecast_service.service import ForecastService

IST = rd.IST
API = "https://api.example/v3"
LAST_DAY, LAST_CLOSE = "2026-10-01", 22421.95          # last row of nifty50_clean.csv


def tmp_csv():
    d = Path(tempfile.mkdtemp())
    p = d / "data.csv"
    shutil.copy(DEFAULT_DATA_PATH, p)
    return p


def candle(day, o, h, l, c, vol=0):
    return [f"{day}T00:00:00+05:30", o, h, l, c, vol, 0]


def fake(candles, calls=None):
    def get(url, token):
        if calls is not None:
            calls.append((url, token))
        return {"status": "success", "data": {"candles": candles}}
    return get


NEW = [candle("2026-10-05", 22430.0, 22600.0, 22400.0, 22550.5),
       candle(LAST_DAY, 22543.7, 22610.6, 22217.3, LAST_CLOSE),
       candle("2026-10-06", 22550.0, 22700.0, 22500.0, 22650.25, 123)]    # unsorted on purpose
AFTER_CLOSE = dt.datetime(2026, 10, 6, 17, 0, tzinfo=IST)


def run(path, candles, now=AFTER_CLOSE, **kw):
    return rd.refresh(path, "TOKEN", API, now_ist=now, get=fake(candles), **kw)


def expect_error(fn, match):
    try:
        fn()
    except rd.RefreshError as e:
        assert match in str(e), str(e)
        return str(e)
    raise AssertionError(f"expected RefreshError containing {match!r}")


def test_appends_new_days_with_log_returns():
    p = tmp_csv(); before = len(pd.read_csv(p))
    assert run(p, NEW) == 2
    df = pd.read_csv(p)
    assert len(df) == before + 2 and list(df.columns) == rd.COLUMNS
    tail = df.tail(2)
    assert tail.Date.tolist() == ["2026-10-05", "2026-10-06"]
    assert math.isclose(tail.Log_Return.iloc[0], math.log(22550.5 / LAST_CLOSE), rel_tol=1e-12)
    assert math.isclose(tail.Log_Return.iloc[1], math.log(22650.25 / 22550.5), rel_tol=1e-12)
    assert pd.isna(tail.Shares_Traded.iloc[0]) and tail.Shares_Traded.iloc[1] == 123
    orig = pd.read_csv(DEFAULT_DATA_PATH)              # existing rows unchanged
    pd.testing.assert_frame_equal(df.head(len(orig)), orig, check_dtype=False)


def test_requests_last_csv_day_to_today_with_encoded_key():
    p = tmp_csv(); calls = []
    rd.refresh(p, "TOKEN", API, now_ist=AFTER_CLOSE, get=fake(NEW, calls))
    url, token = calls[0]
    assert url == f"{API}/historical-candle/NSE_INDEX%7CNifty%2050/days/1/2026-10-06/{LAST_DAY}"
    assert token == "TOKEN"


def test_up_to_date_leaves_file_untouched():
    p = tmp_csv(); mtime = p.stat().st_mtime_ns
    assert run(p, [candle(LAST_DAY, 22543.7, 22610.6, 22217.3, LAST_CLOSE)]) == 0
    assert p.stat().st_mtime_ns == mtime


def test_ignores_todays_candle_before_the_session_completes():
    p = tmp_csv()
    during = dt.datetime(2026, 10, 6, 14, 0, tzinfo=IST)
    assert run(p, NEW, now=during) == 1
    assert pd.read_csv(p).Date.iloc[-1] == "2026-10-05"


def test_source_mismatch_aborts_without_writing():
    p = tmp_csv(); mtime = p.stat().st_mtime_ns
    bad = [candle(LAST_DAY, 22543.7, 22610.6, 22217.3, LAST_CLOSE + 5), NEW[0]]
    expect_error(lambda: run(p, bad), "Source mismatch")
    assert p.stat().st_mtime_ns == mtime


def test_missing_overlap_day_aborts():
    expect_error(lambda: run(tmp_csv(), [NEW[0]]), "cannot confirm")


def test_rejects_bad_rows_and_writes_nothing():
    overlap = candle(LAST_DAY, 22543.7, 22610.6, 22217.3, LAST_CLOSE)
    for bad, msg in [
        (candle("2026-10-05", 22430.0, 22600.0, 22400.0, -1.0), "positive"),
        (candle("2026-10-05", 22430.0, 22500.0, 22400.0, 22550.5), "inconsistent OHLC"),   # close above high
        (candle("2026-10-05", float("nan"), 22600.0, 22400.0, 22550.5), "positive"),
        (["not-a-date", 1, 2, 3, 4, 0, 0], "Malformed"),
        (["2026-10-05T00:00:00+05:30", 1], "Malformed"),
    ]:
        p = tmp_csv(); mtime = p.stat().st_mtime_ns
        expect_error(lambda: run(p, [overlap, bad]), msg)
        assert p.stat().st_mtime_ns == mtime, msg


def test_rejects_duplicate_days():
    expect_error(lambda: run(tmp_csv(), [NEW[1], NEW[0], NEW[0]]), "Duplicate")


def test_rejects_unexpected_response_and_missing_token():
    p = tmp_csv()
    expect_error(lambda: rd.refresh(p, "T", API, now_ist=AFTER_CLOSE, get=lambda u, t: {"status": "error"}), "data.candles")
    expect_error(lambda: rd.refresh(p, "", API, now_ist=AFTER_CLOSE, get=fake(NEW)), "UPSTOX_ACCESS_TOKEN")


def test_http_errors_do_not_leak_the_token():
    import urllib.error, urllib.request
    original = urllib.request.urlopen
    def boom(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)
    urllib.request.urlopen = boom
    try:
        msg = expect_error(lambda: rd.http_get_json("https://x/y", "SECRET-TOKEN"), "HTTP 401")
        assert "SECRET-TOKEN" not in msg
    finally:
        urllib.request.urlopen = original


def test_dry_run_validates_but_does_not_write():
    p = tmp_csv(); mtime = p.stat().st_mtime_ns
    assert run(p, NEW, dry_run=True) == 2
    assert p.stat().st_mtime_ns == mtime


def test_running_service_picks_up_the_refreshed_file():
    p = tmp_csv()
    os.environ["DATA_PATH"] = str(p)
    try:
        svc = ForecastService(today=lambda: dt.date(2026, 10, 8))
        try:
            svc.forecast("^NSEI", "index", 90)
            raise AssertionError("expected DATA_STALE before the refresh")
        except Exception as e:
            assert getattr(e, "code", None) == "DATA_STALE", e
        run(p, NEW)
        os.utime(p, None)
        r = svc.forecast("^NSEI", "index", 90, 10, 100)
        assert r["data"]["asOf"] == "2026-10-06" and r["data"]["spot"] == 22650.25
    finally:
        os.environ.pop("DATA_PATH", None)


def test_cli_fails_without_a_token():
    p = tmp_csv()
    saved = os.environ.pop("UPSTOX_ACCESS_TOKEN", None)
    try:
        assert rd.main(["--csv", str(p)]) == 1
    finally:
        if saved is not None:
            os.environ["UPSTOX_ACCESS_TOKEN"] = saved



# ---- Yahoo Finance source (free, no key) ----

def ist_open(day):
    """Yahoo stamps NSE daily bars at the 09:15 IST open."""
    return int(dt.datetime.combine(dt.date.fromisoformat(day), dt.time(9, 15), IST).timestamp())


def yahoo_body(bars, symbol="^NSEI", currency="INR"):
    return {"chart": {"error": None, "result": [{
        "meta": {"symbol": symbol, "currency": currency, "exchangeTimezoneName": "Asia/Kolkata"},
        "timestamp": [ist_open(b[0]) for b in bars],
        "indicators": {"quote": [{
            "open": [b[1] for b in bars], "high": [b[2] for b in bars], "low": [b[3] for b in bars],
            "close": [b[4] for b in bars], "volume": [b[5] for b in bars]}]}}]}}


def yahoo_run(path, body, now=AFTER_CLOSE, calls=None, **kw):
    def get(url, token):
        if calls is not None:
            calls.append((url, token))
        return body
    return rd.refresh(path, "", "https://yahoo.example", now_ist=now, get=get, source="yahoo", **kw)


# Yahoo returns float32 noise; the last CSV close is 22421.95.
YAHOO_NEW = [(LAST_DAY, 22543.69921875, 22610.6, 22217.30078125, 22421.94921875, 0),
             ("2026-10-02", None, None, None, None, None),                    # holiday listed with nulls
             ("2026-10-05", 22430.0, 22600.0, 22400.0, 22550.5, 0),
             ("2026-10-06", 22550.0, 22700.0, 22500.0, 22650.25, 0)]


def test_yahoo_appends_new_days_rounded_and_skips_null_bars():
    p = tmp_csv(); before = len(pd.read_csv(p)); calls = []
    assert yahoo_run(p, yahoo_body(YAHOO_NEW), calls=calls) == 2
    df = pd.read_csv(p)
    assert len(df) == before + 2
    assert df.tail(2).Date.tolist() == ["2026-10-05", "2026-10-06"]       # 2026-10-02 not filled
    assert "/v8/finance/chart/%5ENSEI?" in calls[0][0] and "interval=1d" in calls[0][0]
    assert calls[0][1] == ""                                                # no key is sent


def test_yahoo_needs_no_token_but_checks_the_overlap_day():
    p = tmp_csv()
    bad = [(LAST_DAY, 1, 2, 0.5, 22500.0, 0)] + YAHOO_NEW[2:]
    expect_error(lambda: yahoo_run(p, yahoo_body(bad)), "Source mismatch")


def test_yahoo_rejects_wrong_symbol_and_malformed_body():
    p = tmp_csv()
    expect_error(lambda: yahoo_run(p, yahoo_body(YAHOO_NEW, symbol="^GSPC")), "not ^NSEI")
    expect_error(lambda: yahoo_run(p, {"chart": {"result": None, "error": None}}), "Unexpected Yahoo")
    expect_error(lambda: yahoo_run(p, {"chart": {"result": None, "error": {"code": "Not Found"}}}), "Yahoo Finance error")


def test_yahoo_url_covers_the_whole_range():
    url = rd.yahoo_url("https://y.example/", "^NSEI", dt.date(2026, 10, 1), dt.date(2026, 10, 6))
    q = dict(x.split("=") for x in url.split("?")[1].split("&"))
    assert int(q["period1"]) == int(dt.datetime(2026, 10, 1, tzinfo=IST).timestamp())
    assert int(q["period2"]) == int(dt.datetime(2026, 10, 7, tzinfo=IST).timestamp())


def test_unknown_source_is_refused():
    expect_error(lambda: rd.refresh(tmp_csv(), "", "x", source="stooq"), "Unknown source")
