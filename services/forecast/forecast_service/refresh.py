"""Append new Nifty 50 daily closes to data/nifty50_clean.csv from the Upstox historical candle API.

Run from services/forecast after the close on trading days (e.g. 16:30 IST):
    UPSTOX_ACCESS_TOKEN=... python -m forecast_service.refresh [--csv PATH] [--dry-run]

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
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
SESSION_COMPLETE = dt.time(16, 0)          # NSE closes 15:30 IST; leave a margin
CLOSE_TOLERANCE = 0.01                     # index points; closes are quoted to 2 decimals
COLUMNS = ["Date", "Open", "High", "Low", "Close", "Shares_Traded", "Turnover_Cr", "Log_Return"]


class RefreshError(Exception):
    pass


def candle_url(api_url, instrument_key, from_date, to_date):
    key = urllib.parse.quote(instrument_key, safe="")
    return f"{api_url.rstrip('/')}/historical-candle/{key}/days/1/{to_date.isoformat()}/{from_date.isoformat()}"


def http_get_json(url, token, timeout=20):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RefreshError(f"Upstox returned HTTP {e.code}") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise RefreshError(f"Upstox is unreachable: {getattr(e, 'reason', e)}") from None
    except json.JSONDecodeError:
        raise RefreshError("Upstox returned invalid JSON") from None


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
        raise RefreshError(f"Upstox has no candle for {last_day}, the last CSV day; cannot confirm the source matches")
    src_close = candles[last_day][3]
    if abs(src_close - last_close) > CLOSE_TOLERANCE:
        raise RefreshError(f"Source mismatch on {last_day}: CSV close {last_close}, Upstox close {src_close}. Not appending.")

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


def refresh(csv_path, token, api_url, now_ist=None, get=http_get_json, dry_run=False):
    """Returns the number of rows appended (or that would be appended, with dry_run)."""
    if not token:
        raise RefreshError("UPSTOX_ACCESS_TOKEN is not set")
    now_ist = now_ist or dt.datetime.now(IST)
    df = pd.read_csv(csv_path, parse_dates=["Date"]).sort_values("Date").reset_index(drop=True)
    if df.empty:
        raise RefreshError(f"{csv_path} is empty")
    candles = fetch_candles(df.Date.max().date(), now_ist.date(), token, api_url, get)
    rows = new_rows(df, candles, now_ist)
    if rows and not dry_run:
        write_atomic(Path(csv_path), df, rows)
    return len(rows)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--csv", default=os.getenv("DATA_PATH", str(DEFAULT_DATA_PATH)))
    p.add_argument("--dry-run", action="store_true", help="fetch and validate, but do not write")
    a = p.parse_args(argv)
    try:
        n = refresh(Path(a.csv), os.getenv("UPSTOX_ACCESS_TOKEN", ""),
                    os.getenv("UPSTOX_API_URL", "https://api.upstox.com/v3"), dry_run=a.dry_run)
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
