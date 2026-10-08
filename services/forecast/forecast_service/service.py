"""Framework-free core of the forecast service (testable without FastAPI)."""
import datetime as dt
import json
import math

import numpy as np
import pandas as pd

from . import model as nm
from .config import load_settings
from .contract import (CONTRACT_VERSION, DEFAULT_TRAINING_WINDOW_YEARS, MODEL_NAME, MODEL_VERSION,
                       SUPPORTED_UNDERLYINGS, TRAINING_WINDOW_MAX_YEARS, TRAINING_WINDOW_MIN_YEARS,
                       trading_days)


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _r(a):
    return np.round(np.asarray(a, float), 2).tolist()


class ForecastService:
    def __init__(self, today=None):
        """`today` returns the current date; tests pass a fixed one."""
        self.cfg = load_settings()
        self._today = today or dt.date.today
        self._mtime = None
        self.reload()

    def reload(self):
        path = self.cfg["data_path"]
        d = pd.read_csv(path, parse_dates=["Date"]).sort_values("Date").reset_index(drop=True)
        if d.empty or d.Close.isna().any() or (d.Close <= 0).any():
            raise ValueError(f"{path}: closes must be present and positive")
        self.df = d
        self.as_of = d.Date.max().date()
        self._fits = {}            # (as_of, window_years) -> fit tuple
        self.model_fit_at = None
        self._mtime = path.stat().st_mtime
        self._backtest = json.loads(self.cfg["backtest_path"].read_text())

    def _reload_if_changed(self):
        # Picks up a refreshed CSV without a restart (the refresh job replaces the file).
        if self.cfg["data_path"].stat().st_mtime != self._mtime:
            self.reload()

    # ---- fitting (cached: only simulation runs per request) ----
    def _fit(self, window_years):
        key = (self.as_of, window_years)
        if key not in self._fits:
            # The window is a number of calendar days (30 to 1,095), so it can be fractional years.
            days = round(window_years * 365)
            d = self.df[self.df.Date >= self.df.Date.max() - pd.Timedelta(days=days)]
            lr = (np.log(d.Close).diff().dropna() * 100).values
            try:
                p = nm.fit_garch(lr)
                if not all(math.isfinite(v) for v in p.values()) or p["alpha"] + p["beta"] >= 1:
                    raise ValueError("invalid GARCH parameters")
            except Exception as e:
                raise ApiError(500, "MODEL_FIT_FAILED", f"GARCH fit failed: {e}")
            now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            self._fits[key] = (p, d.Date.min().date(), d.Date.max().date(), float(d.Close.iloc[-1]), len(lr), now)
            self.model_fit_at = now
        return self._fits[key]

    def _backtest_for(self, steps):
        """Backtest row closest to the requested horizon (computed offline, data/backtest_results.json)."""
        rows = self._backtest["results"]
        row = min(rows, key=lambda x: abs(x["tradingDays"] - steps))
        return dict(horizonTradingDays=int(row["tradingDays"]), windows=int(row["samples"]),
                    bandCoverage=float(row["bandCoverage"]),
                    baseMape=round(row["baseMapePct"] / 100, 6), naiveMape=round(row["naiveMapePct"] / 100, 6))

    # ---- endpoints ----
    def forecast(self, symbol, asset_class, tenor_days, training_window_years=DEFAULT_TRAINING_WINDOW_YEARS,
                 sample_path_count=500):
        c = self.cfg
        if SUPPORTED_UNDERLYINGS.get(symbol) != asset_class:
            raise ApiError(400, "UNSUPPORTED_UNDERLYING", f"Underlying {symbol!r} ({asset_class}) is not supported")
        if not (c["min_tenor"] <= tenor_days <= c["max_tenor"]):
            raise ApiError(422, "INVALID_REQUEST", f"tenorDays must be between {c['min_tenor']} and {c['max_tenor']}")
        if (isinstance(training_window_years, bool) or not isinstance(training_window_years, (int, float))
                or not (TRAINING_WINDOW_MIN_YEARS <= training_window_years <= TRAINING_WINDOW_MAX_YEARS)):
            raise ApiError(422, "INVALID_REQUEST",
                           "trainingWindowYears must be between 30/365 (30 days) and 3 (1,095 days)")
        if not (c["min_samples"] <= sample_path_count <= c["max_samples"]):
            raise ApiError(422, "INVALID_REQUEST", f"samplePathCount must be between {c['min_samples']} and {c['max_samples']}")
        self._reload_if_changed()
        if (self._today() - self.as_of).days > c["stale_days"]:
            raise ApiError(503, "DATA_STALE", f"Latest close {self.as_of} is older than {c['stale_days']} days")

        steps = trading_days(tenor_days)
        p, w0, w1, last, n_obs, _ = self._fit(training_window_years)
        sim = nm.simulate(p, last, steps, c["n_paths"], c["drift"], c["seed"])       # (steps, n_paths)
        paths = np.vstack([np.full(sim.shape[1], last), sim])                          # index 0 = spot
        final = paths[-1]
        q = np.percentile(final, [5, 50, 95])
        idx = [int(np.argmin(np.abs(final - x))) for x in q]
        case = lambda pct, i: dict(percentile=pct, path=_r(paths[:, i]))
        fan = np.percentile(paths, [5, 50, 95], axis=1)
        return dict(
            contractVersion=CONTRACT_VERSION,
            model=dict(name=MODEL_NAME, version=MODEL_VERSION, simulations=c["n_paths"],
                       drift=dict(method="fixed", annualized=round(c["drift"] * 252 / 100, 6))),
            data=dict(symbol=symbol, asOf=str(self.as_of), trainingStart=str(w0), trainingEnd=str(w1),
                      observations=int(n_obs), spot=round(last, 2)),
            horizon=dict(tenorDays=tenor_days, tradingDays=steps),
            cases=dict(low=case(5, idx[0]), base=case(50, idx[1]), high=case(95, idx[2])),
            terminalQuantiles=dict(p5=round(float(q[0]), 2), p50=round(float(q[1]), 2), p95=round(float(q[2]), 2)),
            fan=dict(p5=_r(fan[0]), p50=_r(fan[1]), p95=_r(fan[2])),
            # Paths are i.i.d. draws, so the first k are a uniformly random subset of all paths.
            samplePaths=[_r(paths[:, j]) for j in range(sample_path_count)],
            backtest=self._backtest_for(steps),
            notice="Scenario simulation, not a guarantee.",
        )

    def model_card(self):
        c = self.cfg
        p, w0, w1, _, n_obs, _ = self._fit(10)
        return dict(model=MODEL_NAME, version=MODEL_VERSION, simulations=c["n_paths"],
                    trainingWindow=dict(start=str(w0), end=str(w1), observations=int(n_obs)),
                    drift=dict(method="fixed", perTradingDayPct=c["drift"], annualized=round(c["drift"] * 252 / 100, 6)),
                    params={k: round(float(v), 5) for k, v in p.items() if k != "h_next"},
                    supportedTenorDays=dict(min=c["min_tenor"], max=c["max_tenor"]),
                    backtest=self._backtest)

    def health(self):
        stale = (self._today() - self.as_of).days > self.cfg["stale_days"]
        return dict(status="stale" if stale else "ok", dataAsOf=str(self.as_of), modelFitAt=self.model_fit_at)
