"""Framework-free core of the forecast service (testable without FastAPI)."""
import os, json, math, datetime as dt
from pathlib import Path
import numpy as np, pandas as pd
import nifty_model as nm

BASE = Path(__file__).parent
SUPPORTED_UNDERLYINGS = {"^NSEI"}


def _cfg():
    return dict(
        data_path=Path(os.getenv("DATA_PATH", BASE / "nifty50_clean.csv")),
        min_tenor=int(os.getenv("MIN_TENOR_DAYS", 7)),
        max_tenor=int(os.getenv("MAX_TENOR_DAYS", 365)),
        drift=float(os.getenv("DRIFT_PCT_PER_DAY", 0.03)),
        stale_days=int(os.getenv("STALE_DAYS", 7)),
        n_paths=int(os.getenv("N_PATHS", 10000)),
        seed=int(os.getenv("SEED", 42)),
    )


class ApiError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


def _today():
    o = os.getenv("TODAY_OVERRIDE")  # for tests only
    return dt.date.fromisoformat(o) if o else dt.date.today()


def _r(a):
    return np.round(np.asarray(a, float), 2).tolist()


class ForecastService:
    def __init__(self):
        self.cfg = _cfg()
        self.reload()

    def reload(self):
        d = pd.read_csv(self.cfg["data_path"], parse_dates=["Date"]).sort_values("Date").reset_index(drop=True)
        self.df = d
        self.as_of = d.Date.max().date()
        self._fits = {}            # (as_of, window_years) -> (params, window_start, window_end, fit_time)
        self.model_fit_at = None

    # ---- fitting (cached: only simulation runs per request) ----
    def _fit(self, window_years):
        key = (self.as_of, window_years)
        if key not in self._fits:
            d = self.df[self.df.Date >= self.df.Date.max() - pd.DateOffset(years=window_years)]
            lr = (np.log(d.Close).diff().dropna() * 100).values
            try:
                p = nm.fit_garch(lr)
                if not all(math.isfinite(v) for v in p.values()) or p["alpha"] + p["beta"] >= 1:
                    raise ValueError("invalid GARCH parameters")
            except Exception as e:
                raise ApiError(500, "MODEL_FIT_FAILED", f"GARCH fit failed: {e}")
            now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            self._fits[key] = (p, d.Date.min().date(), d.Date.max().date(), d.Close.iloc[-1], now)
            self.model_fit_at = now
        return self._fits[key]

    # ---- endpoints ----
    def forecast(self, underlying, tenor_days, training_window_years=10, n_sample_paths=500):
        c = self.cfg
        if underlying not in SUPPORTED_UNDERLYINGS:
            raise ApiError(400, "UNSUPPORTED_UNDERLYING", f"Underlying {underlying!r} is not supported")
        if not (c["min_tenor"] <= tenor_days <= c["max_tenor"]):
            raise ApiError(422, "INVALID_REQUEST", f"tenorDays must be between {c['min_tenor']} and {c['max_tenor']}")
        if not (3 <= training_window_years <= 10):
            raise ApiError(422, "INVALID_REQUEST", "trainingWindowYears must be between 3 and 10")
        if not (0 <= n_sample_paths <= 1000):
            raise ApiError(422, "INVALID_REQUEST", "nSamplePaths must be between 0 and 1000")
        if (_today() - self.as_of).days > c["stale_days"]:
            raise ApiError(503, "DATA_STALE", f"Latest close {self.as_of} is older than {c['stale_days']} days")

        steps = int(round(tenor_days * 252 / 365))
        p, w0, w1, last, _ = self._fit(training_window_years)
        paths = nm.simulate(p, last, steps, c["n_paths"], c["drift"], c["seed"])      # (steps, n_paths)
        final = paths[-1]
        q = np.percentile(final, [5, 50, 95])
        idx = [int(np.argmin(np.abs(final - x))) for x in q]
        mk = lambda pct, i: dict(percentile=pct, finalValue=round(float(paths[-1, i]), 2), path=_r(paths[:, i]))
        fan = np.percentile(paths, [5, 50, 95], axis=1)
        return dict(
            asOf=str(self.as_of), underlying=underlying, lastClose=round(float(last), 2),
            tenorDays=tenor_days, tradingDays=steps,
            cases=dict(low=mk(5, idx[0]), base=mk(50, idx[1]), high=mk(95, idx[2])),
            fan=dict(p5=_r(fan[0]), p50=_r(fan[1]), p95=_r(fan[2])),
            samplePaths=[_r(paths[:, j]) for j in range(n_sample_paths)],
            model=dict(name="GARCH(1,1)-t", nPaths=c["n_paths"],
                       trainingWindow=dict(start=str(w0), end=str(w1)),
                       drift=dict(type="fixed", perTradingDayPct=c["drift"], approxAnnualPct=round(c["drift"] * 252, 1)),
                       params={k: round(float(v), 5) for k, v in p.items() if k != "h_next"}),
            notice="Scenario simulation, not a guarantee.")

    def model_card(self):
        c = self.cfg
        p, w0, w1, _, _ = self._fit(10)
        bt = json.loads((BASE / "backtest_results.json").read_text())
        return dict(model="GARCH(1,1)-t", nPaths=c["n_paths"],
                    trainingWindow=dict(start=str(w0), end=str(w1)),
                    drift=dict(type="fixed", perTradingDayPct=c["drift"], approxAnnualPct=round(c["drift"] * 252, 1)),
                    params={k: round(float(v), 5) for k, v in p.items() if k != "h_next"},
                    supportedTenorDays=dict(min=c["min_tenor"], max=c["max_tenor"]),
                    backtest=bt)

    def health(self):
        return dict(status="ok", dataAsOf=str(self.as_of), modelFitAt=self.model_fit_at)


def validate_response(resp, tenor_days, today=None, stale_days=7):
    """The backend's contract checks (section 4 of forecasting.md). Returns list of problems; empty = valid."""
    errs = []
    try:
        n = int(resp["tradingDays"])
        if n != int(round(tenor_days * 252 / 365)): errs.append("tradingDays does not match tenorDays")
        series = {f"cases.{k}.path": resp["cases"][k]["path"] for k in ("low", "base", "high")}
        series.update({f"fan.{k}": resp["fan"][k] for k in ("p5", "p50", "p95")})
        for i, row in enumerate(resp.get("samplePaths", [])): series[f"samplePaths[{i}]"] = row
        for name, arr in series.items():
            if len(arr) != n: errs.append(f"{name}: length {len(arr)} != {n}"); continue
            if not all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in arr):
                errs.append(f"{name}: non-finite or non-positive value")
        lo, ba, hi = (resp["cases"][k]["finalValue"] for k in ("low", "base", "high"))
        if not lo <= ba <= hi: errs.append("finalValue order violated (low <= base <= high)")
        f = resp["fan"]
        if any(not (a <= b <= c) for a, b, c in zip(f["p5"], f["p50"], f["p95"])): errs.append("fan order violated")
        t = today or dt.date.today()
        if (t - dt.date.fromisoformat(resp["asOf"])).days > stale_days: errs.append("asOf is stale")
    except (KeyError, TypeError, ValueError) as e:
        errs.append(f"malformed response: {e!r}")
    return errs
