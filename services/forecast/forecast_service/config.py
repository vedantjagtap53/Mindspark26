"""Settings from environment variables. Defaults point at the bundled data/ folder."""
import os
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = SERVICE_ROOT / "data"
DEFAULT_DATA_PATH = DATA_DIR / "nifty50_clean.csv"
DEFAULT_BACKTEST_PATH = DATA_DIR / "backtest_results.json"


def load_settings():
    """Read on each ForecastService construction, so tests can change env between instances."""
    return dict(
        data_path=Path(os.getenv("DATA_PATH", DEFAULT_DATA_PATH)),
        backtest_path=Path(os.getenv("BACKTEST_PATH", DEFAULT_BACKTEST_PATH)),
        min_tenor=int(os.getenv("MIN_TENOR_DAYS", 30)),
        max_tenor=int(os.getenv("MAX_TENOR_DAYS", 1095)),
        min_samples=100,
        max_samples=2000,
        drift=float(os.getenv("DRIFT_PCT_PER_DAY", 0.03)),
        stale_days=int(os.getenv("STALE_DAYS", 5)),
        n_paths=max(10000, int(os.getenv("N_PATHS", 10000))),
        seed=int(os.getenv("SEED", 42)),
    )
