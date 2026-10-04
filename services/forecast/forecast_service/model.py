"""Nifty 50 maturity-value forecaster: GARCH(1,1) + Student-t Monte Carlo.
Usage (from services/forecast): python -m forecast_service.model [tenor_days]
This module accepts any tenor of at least 1 trading day; the HTTP service enforces the
contract range (30-1,095 days, docs/forecasting.md).
Returns low/base/high (P5/P50/P95) of the index level at maturity, not a single point.
"""
import sys, numpy as np, pandas as pd
from scipy.optimize import minimize
from scipy.special import gammaln

from .config import DEFAULT_DATA_PATH

def _nll(p, r):
    mu, om, a, b, nu = p
    if om <= 0 or a < 0 or b < 0 or a + b >= 0.999 or nu <= 2.05: return 1e10
    e = r - mu; h = np.empty_like(r); h[0] = r.var()
    for t in range(1, len(r)): h[t] = om + a * e[t-1]**2 + b * h[t-1]
    z2 = e**2 / h
    ll = (gammaln((nu+1)/2) - gammaln(nu/2) - 0.5*np.log(np.pi*(nu-2)) - 0.5*np.log(h)
          - (nu+1)/2 * np.log1p(z2/(nu-2)))
    return -ll.sum()

def fit_garch(logret_pct):
    r = np.asarray(logret_pct, float); v = r.var()
    best = None
    for a0, b0 in [(0.08, 0.90), (0.12, 0.85)]:
        res = minimize(_nll, [r.mean(), v*(1-a0-b0), a0, b0, 6.0], args=(r,), method="Nelder-Mead",
                       options=dict(maxiter=4000, xatol=1e-6, fatol=1e-6))
        if best is None or res.fun < best.fun: best = res
    mu, om, a, b, nu = best.x
    # Same recursion as _nll: h_0 = sample variance, h_t = om + a*e_{t-1}^2 + b*h_{t-1}.
    # After the loop h = h_{n-1}; h_next = h_n, the variance of the first simulated day.
    # (The previous version applied the last shock twice and overstated h_next by ~3%.)
    e = r - mu; h = v
    for t in range(1, len(r)): h = om + a*e[t-1]**2 + b*h
    h_next = om + a*e[-1]**2 + b*h
    return dict(mu=mu, omega=om, alpha=a, beta=b, nu=nu, h_next=h_next)

def simulate(params, last_close, steps, n_paths=10000, drift_pct=None, seed=42):
    rng = np.random.default_rng(seed)
    mu = params["mu"] if drift_pct is None else drift_pct
    nu = params["nu"]; h = np.full(n_paths, params["h_next"]); cum = np.zeros((steps, n_paths))
    run = np.zeros(n_paths)
    for t in range(steps):
        z = rng.standard_t(nu, n_paths) * np.sqrt((nu-2)/nu)
        e = np.sqrt(h) * z
        run += (mu + e) / 100.0
        cum[t] = run
        h = params["omega"] + params["alpha"]*e**2 + params["beta"]*h
    return last_close * np.exp(cum)          # shape (steps, n_paths)

def forecast(df, tenor_days, window_years=10, n_paths=10000, n_sample=500, drift_pct=0.03):
    if round(tenor_days * 252 / 365) < 1: raise ValueError("tenor must be at least 1 trading day")
    d = df.sort_values("Date"); d = d[d.Date >= d.Date.max() - pd.DateOffset(years=window_years)]
    lr = (np.log(d.Close).diff().dropna() * 100).values
    p = fit_garch(lr); steps = int(round(tenor_days * 252 / 365)); last = float(d.Close.iloc[-1])
    paths = simulate(p, last, steps, n_paths, drift_pct)
    final = paths[-1]; q = np.percentile(final, [5, 50, 95])
    idx = [int(np.argmin(abs(final - x))) for x in q]
    return dict(as_of=str(d.Date.max().date()), last_close=last, tenor_days=tenor_days, trading_days=steps,
                model="GARCH(1,1)-t", drift=f"fixed {drift_pct}%/trading day (~{drift_pct*252:.1f}%/yr)", train_window=f"{d.Date.min().date()} to {d.Date.max().date()}",
                params={k: round(v, 5) for k, v in p.items()},
                low=float(q[0]), base=float(q[1]), high=float(q[2]),
                low_path=paths[:, idx[0]], base_path=paths[:, idx[1]], high_path=paths[:, idx[2]],
                fan=np.percentile(paths, [5, 50, 95], axis=1).T,
                sample_paths=paths[:, :n_sample])

def load(path=DEFAULT_DATA_PATH):
    return pd.read_csv(path, parse_dates=["Date"])

def backtest(df, horizon_days, step=21, min_train=750, n_paths=3000, drift_pct=None):
    d = df.sort_values("Date").reset_index(drop=True); steps = int(round(horizon_days*252/365)); rows = []
    for i in range(min_train, len(d) - steps, step):
        tr = d.iloc[:i+1]; lr = (np.log(tr.Close).diff().dropna()*100).values[-2520:]
        p = fit_garch(lr); f = simulate(p, tr.Close.iloc[-1], steps, n_paths, drift_pct)[-1]
        lo, md, hi = np.percentile(f, [5, 50, 95]); act = d.Close.iloc[i+steps]
        rows.append((lo <= act <= hi, abs(md-act)/act, abs(tr.Close.iloc[-1]-act)/act))
    a = np.array(rows, float)
    return dict(horizon_days=horizon_days, n=len(a), coverage=a[:,0].mean(), base_mape=a[:,1].mean()*100, naive_mape=a[:,2].mean()*100)

if __name__ == "__main__":
    t = int(sys.argv[1]) if len(sys.argv) > 1 else 180
    r = forecast(load(), t)
    print(f"As of {r['as_of']} close {r['last_close']:.2f} | {t} days ({r['trading_days']} trading days)")
    print(f"Low (P5) {r['low']:.0f} | Base (P50) {r['base']:.0f} | High (P95) {r['high']:.0f}")
    print("Drift:", r["drift"]); print(r["params"])
