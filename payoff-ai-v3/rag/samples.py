"""Sample SimulationContext payloads for tests and demos."""

ELN_MODE_A = {
        "simulation_id": "sim-001",
        "mode": "A",
        "currency": "INR",
        "terms": {
            "product": "ELN", "underlying": "^NSEI", "notional": 1_000_000,
            "tenor_days": 180, "strike_pct": 100, "barrier_pct": 70,
            "barrier_type": "american", "coupon_pct_pa": 12,
        },
        "profile": {
            "risk_appetite": "medium", "investment_horizon_days": 365,
            "loss_tolerance_pct": 15, "concentration_pct": 20,
        },
        "cases": [
            {"label": "low", "terminal_level": 21000, "payoff": 780000, "return_pct": -22.0, "knocked_in": True},
            {"label": "base", "terminal_level": 25500, "payoff": 1060000, "return_pct": 6.0, "knocked_in": False},
            {"label": "high", "terminal_level": 29000, "payoff": 1060000, "return_pct": 6.0, "knocked_in": False},
        ],
        "suitability": {
            "verdict": "Not suitable",
            "flags": [{"rule": "low_case_loss", "severity": "not_suitable",
                       "message": "Low-case loss 22% exceeds loss tolerance 15%"}],
        },
        "distribution": {"prob_loss": 0.18, "prob_knock_in": 0.21,
                         "payoff_p5": 780000, "payoff_p50": 1060000, "payoff_p95": 1060000},
        "forecast_meta": {
            "model_name": "GARCH(1,1)-t", "training_start": "2016-10-03", "training_end": "2026-10-02",
            "as_of": "2026-10-03", "drift_assumption": "historical mean",
            "backtest_band_coverage": 0.88, "backtest_base_mape": 0.061, "backtest_naive_mape": 0.064,
        },
    }
