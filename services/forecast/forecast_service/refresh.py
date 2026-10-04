"""Append new Nifty 50 daily closes to data/nifty50_clean.csv.

Sources (--source, or REFRESH_SOURCE):
- yahoo (default): Yahoo Finance chart API for ^NSEI. Free, no account or key; unofficial (no SLA,
  Yahoo's terms apply), so the source check below matters.
- upstox: Upstox historical candle API; needs UPSTOX_ACCESS_TOKEN.

Run from services/forecast after the close on trading days (e.g. 16:30 IST):
    python -m forecast_service.refresh [--source yahoo|upstox] [--csv PATH] [--dry-run]

Safety rules (the forecast must never run on invented or mixed data):
- Only real candles are appended; nothing is filled or interpolated (holidays stay gaps).
- The last day already in the CSV is fetched again and its close must match, otherwise the run aborts
  (catches a different or adjusted source).
- Today's candle is ignored before 16:00 IST (the session may be incomplete).
- Every new row is validated; any failure aborts the run and leaves the file untouched.
- The file is replaced atomically, so the running service never reads a half-written file
  (it reloads automatically when the file changes).
Exit code 0 on success (including "already up to date"), 1 on any error.
"""
import argparse, datetime as dt, json, math, os, sys, tempfile, urllib.error, urllib.parse, urllib.request
from pathlib import Path
import pandas as pd

from .config import DEFAULT_DATA_PATH

INSTRUMENT_KEY = "NSE_INDEX|Nifty 50"
YAHOO_SYMBOL = "^NSEI"
YAHOO_API_URL = "https://query1.finance.yahoo.com"
UPSTOX_API_URL = "https://api.upstox.com/v3"
SOURCES = ("yahoo", "upstox")
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
SESSION_COMPLETE = dt.time(16, 0)          # NSE closes 15:30 IST; leave a margin
CLOSE_TOLERANCE = 0.01                     # index points; closes are quoted to 2 decimals
COLUMNS = ["Date", "Open", "High", "Low", "Close", "Shares_Traded", "Turnover_Cr", "Log_Return"]


class RefreshError(Exception):
    pass


def candle_url(api_url, instrument_key, from_date, to_date):
    key = urllib.parse.quote(instrument_key, safe="")
    return f"{api_url.rstrip('/')}/historical-candle/{key}/days/1/{to_date.isoformat()}/{from_date.isoformat()}"


def yahoo_url(api_url, symbol, from_date, to_date):
    """Daily bars from from_date to to_date inclusive (period2 is exclusive, so one day is added)."""
    start = int(dt.datetime.combine(from_date, dt.time(0), IST).timestamp())
    end = int(dt.datetime.combine(to_date + dt.timedelta(days=1), dt.time(0), IST).timestamp())
    q = urllib.parse.urlencode({"period1": start, "period2": end, "interval": "1d", "events": "history"})
    return f"{api_url.rstrip('/')}/v8/finance/chart/{urllib.parse.quote(symbol, safe='')}?{q}"


def http_get_json(url, token, timeout=20, provider="Upstox"):
    headers = {"Accept": "application/json", "User-Agent": "Mozilla/5.0 (forecast-refresh)"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RefreshError(f"{provider} returned HTTP {e.code}") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise RefreshError(f"{provider} is unreachable: {getattr(e, 'reason', e)}") from None
    except json.JSONDecodeError:
        raise RefreshError(f"{provider} returned invalid JSON") from None


def fetch_candles(from_date, to_date, token, api_url, get=http_get_json):
    """Daily candles as {date: (open, high, low, close, volume)}, oldest first."""
    body = get(candle_url(api_url, INSTRUMENT_KEY, from_date, to_date), token)
    try:
        raw = body["data"]["candles"]
    except (KeyError, TypeError):
        raise RefreshError("Unexpected Upstox response: no data.candles") from None
    out = {}
    for c in raw:
        try:
            day = dt.datetime.fromisoformat(c[0]).astimezone(IST).date()
            o, h, l, cl = (float(x) for x in c[1:5])
            vol = c[5]
        except (IndexError, TypeError, ValueError):
            raise RefreshError(f"Malformed candle: {c!r}") from None
        if day in out:
            raise RefreshError(f"Duplicate candle for {day}")
        out[day] = (o, h, l, cl, vol)
    return dict(sorted(out.items()))


def fetch_yahoo_candles(from_date, to_date, api_url, get=None):
    """Daily bars from Yahoo's chart API as {date: (open, high, low, close, volume)}, oldest first.

    Bars with no close (Yahoo sometimes lists holidays with nulls) are dropped, never filled.
    Prices are rounded to 2 decimals, the precision NSE quotes the index in (Yahoo returns
    float32 noise such as 22421.949219).
    """
    get = get or (lambda url, token: http_get_json(url, token, provider="Yahoo Finance"))
    body = get(yahoo_url(api_url, YAHOO_SYMBOL, from_date, to_date), "")
    try:
        chart = body["chart"]
        if chart.get("error"):
            raise RefreshError(f"Yahoo Finance error: {chart['error']}")
        res = chart["result"][0]
        meta, stamps, quote = res["meta"], res.get("timestamp") or [], res["indicators"]["quote"][0]
    except (KeyError, IndexError, TypeError):
        raise RefreshError("Unexpected Yahoo Finance response: no chart.result") from None
    if meta.get("symbol") != YAHOO_SYMBOL or meta.get("currency") not in (None, "INR"):
        raise RefreshError(f"Yahoo Finance returned {meta.get('symbol')} in {meta.get('currency')}, not {YAHOO_SYMBOL} in INR")
    out = {}
    for i, ts in enumerate(stamps):
        try:
            o, h, l, c = (quote[k][i] for k in ("open", "high", "low", "close"))
            vol = (quote.get("volume") or [None] * len(stamps))[i]
            day = dt.datetime.fromtimestamp(int(ts), IST).date()
        except (IndexError, KeyError, TypeError, ValueError, OverflowError):
            raise RefreshError(f"Malformed Yahoo Finance bar at index {i}") from None
        if c is None:
            continue
        if None in (o, h, l):
            raise RefreshError(f"{day}: Yahoo Finance bar has a close but no open/high/low")
        if day in out:
            raise RefreshError(f"Duplicate bar for {day}")
        out[day] = tuple(round(float(x), 2) for x in (o, h, l, c)) + (vol,)
    return dict(sorted(out.items()))


def _check_row(day, o, h, l, c):
    if not all(math.isfinite(v) and v > 0 for v in (o, h, l, c)):
        raise RefreshError(f"{day}: prices must be positive and finite")
    if l > min(o, c) + 1e-9 or h < max(o, c) - 1e-9:
        raise RefreshError(f"{day}: inconsistent OHLC (low {l}, high {h}, open {o}, close {c})")


def new_rows(df, candles, now_ist):
    """Validated rows to append (may be empty). Raises RefreshError instead of guessing."""
    last_day = df.Date.max().date()
    last_close = float(df.Close.iloc[-1])
    if last_day not in candles:
        raise RefreshError(f"The source has no candle for {last_day}, the last CSV day; cannot confirm the source matches")
    src_close = candles[last_day][3]
    if abs(src_close - last_close) > CLOSE_TOLERANCE:
        raise RefreshError(f"Source mismatch on {last_day}: CSV close {last_close}, source close {src_close}. Not appending.")

    today = now_ist.date()
    rows, prev = [], last_close
    for day, (o, h, l, c, vol) in candles.items():
        if day <= last_day:
            continue
        if day > today or (day == today and now_ist.time() < SESSION_COMPLETE):
            continue                                  # future or still-running session
        _check_row(day, o, h, l, c)
        volume = int(vol) if isinstance(vol, (int, float)) and vol > 0 else None
        rows.append(dict(Date=day.isoformat(), Open=o, High=h, Low=l, Close=c,
                         Shares_Traded=volume, Turnover_Cr=None, Log_Return=math.log(c / prev)))
        prev = c
    return rows


def write_atomic(path, df, rows):
    """Append rows by writing a temp file next to the CSV and renaming it over the original."""
    out = pd.concat([df.assign(Date=df.Date.dt.strftime("%Y-%m-%d")), pd.DataFrame(rows, columns=COLUMNS)],
                    ignore_index=True)[COLUMNS]
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".refresh-", suffix=".csv")
    try:
        with os.fdopen(fd, "w", newline="") as f:
            out.to_csv(f, index=False)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def refresh(csv_path, token, api_url, now_ist=None, get=None, dry_run=False, source="upstox"):
    """Returns the number of rows appended (or that would be appended, with dry_run).
    `get(url, token)` fetches JSON (tests pass a fake); `api_url` is the chosen source's base URL."""
    if source not in SOURCES:
        raise RefreshError(f"Unknown source {source!r}; use one of {', '.join(SOURCES)}")
    if source == "upstox" and not token:
        raise RefreshError("UPSTOX_ACCESS_TOKEN is not set")
    now_ist = now_ist or dt.datetime.now(IST)
    df = pd.read_csv(csv_path, parse_dates=["Date"]).sort_values("Date").reset_index(drop=True)
    if df.empty:
        raise RefreshError(f"{csv_path} is empty")
    from_day, to_day = df.Date.max().date(), now_ist.date()
    if source == "yahoo":
        candles = fetch_yahoo_candles(from_day, to_day, api_url, get)
    else:
        candles = fetch_candles(from_day, to_day, token, api_url, get or http_get_json)
    rows = new_rows(df, candles, now_ist)
    if rows and not dry_run:
        write_atomic(Path(csv_path), df, rows)
    return len(rows)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--csv", default=os.getenv("DATA_PATH", str(DEFAULT_DATA_PATH)))
    p.add_argument("--source", choices=SOURCES, default=os.getenv("REFRESH_SOURCE", "yahoo"))
    p.add_argument("--dry-run", action="store_true", help="fetch and validate, but do not write")
    a = p.parse_args(argv)
    try:
        api_url = (os.getenv("YAHOO_API_URL", YAHOO_API_URL) if a.source == "yahoo"
                   else os.getenv("UPSTOX_API_URL", UPSTOX_API_URL))
        n = refresh(Path(a.csv), os.getenv("UPSTOX_ACCESS_TOKEN", ""), api_url,
                    dry_run=a.dry_run, source=a.source)
    except RefreshError as e:
        print(f"refresh failed: {e}", file=sys.stderr)
        return 1
    last = pd.read_csv(a.csv, usecols=["Date"]).Date.max()
    if a.dry_run:
        print(f"dry run: would append {n} day(s); data currently ends {last}")
    elif n:
        print(f"appended {n} day(s); data now ends {last}")
    else:
        print(f"already up to date (ends {last})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
