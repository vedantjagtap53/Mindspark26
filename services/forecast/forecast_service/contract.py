"""Forecast contract v1.0 (docs/forecasting.md): constants and the response checks.

Every path, fan series and sample path starts at the spot close (index 0) and has
tradingDays + 1 values. `validate_response` mirrors the backend's validateForecastResponse.
"""
import datetime as dt
import math

CONTRACT_VERSION = "1.0"
MODEL_NAME = "garch11-t-montecarlo"
MODEL_VERSION = "1.0.1"          # 1.0.1: one-step-ahead variance fix in model.fit_garch
SUPPORTED_UNDERLYINGS = {"^NSEI": "index"}
# Training window chosen by the RM (PRD.md §7.1, §7.3): 30 days to 3 years, sent as years.
TRAINING_WINDOW_MIN_YEARS = 30 / 365
TRAINING_WINDOW_MAX_YEARS = 1095 / 365
DEFAULT_TRAINING_WINDOW_YEARS = TRAINING_WINDOW_MAX_YEARS


def trading_days(tenor_days):
    return int(round(tenor_days * 252 / 365))


def validate_response(resp, request, today, stale_days=5):
    """Returns a list of problems; empty means the response meets the contract."""
    errs = []
    try:
        if resp["contractVersion"] != CONTRACT_VERSION: errs.append("contractVersion")
        n = trading_days(request["tenorDays"])
        if resp["horizon"]["tradingDays"] != n: errs.append("horizon.tradingDays")
        if resp["horizon"]["tenorDays"] != request["tenorDays"]: errs.append("horizon.tenorDays")
        if resp["data"]["symbol"] != request["symbol"]: errs.append("data.symbol")
        spot = resp["data"]["spot"]
        series = {f"cases.{k}.path": resp["cases"][k]["path"] for k in ("low", "base", "high")}
        series.update({f"fan.{k}": resp["fan"][k] for k in ("p5", "p50", "p95")})
        for i, row in enumerate(resp["samplePaths"]): series[f"samplePaths[{i}]"] = row
        for name, arr in series.items():
            if len(arr) != n + 1: errs.append(f"{name}: length {len(arr)} != {n + 1}"); continue
            if abs(arr[0] - spot) > 1e-6 * spot: errs.append(f"{name}: first value != spot")
            if not all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in arr):
                errs.append(f"{name}: non-finite or non-positive value")
        if len(resp["samplePaths"]) != request["samplePathCount"]: errs.append("samplePaths count")
        q = resp["terminalQuantiles"]
        if not q["p5"] <= q["p50"] <= q["p95"]: errs.append("terminalQuantiles order")
        lo, ba, hi = (resp["cases"][k]["path"][-1] for k in ("low", "base", "high"))
        if not lo <= ba <= hi: errs.append("case final values order")
        f = resp["fan"]
        if any(not (a <= b <= c) for a, b, c in zip(f["p5"], f["p50"], f["p95"])): errs.append("fan order")
        if resp["model"]["simulations"] < 10000: errs.append("model.simulations")
        bt = resp["backtest"]
        if not 0 <= bt["bandCoverage"] <= 1 or bt["baseMape"] < 0 or bt["naiveMape"] < 0: errs.append("backtest")
        if (today - dt.date.fromisoformat(resp["data"]["asOf"])).days > stale_days: errs.append("asOf is stale")
    except (KeyError, TypeError, ValueError) as e:
        errs.append(f"malformed response: {e!r}")
    return errs
