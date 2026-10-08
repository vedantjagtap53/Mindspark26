"""Pins the tests to a frozen data snapshot.

The tests assert exact dates and closes (last day 2026-10-01, close 22421.95). Production data in
data/nifty50_clean.csv moves on every refresh, so the suite reads this fixture instead; refreshing
the real file can no longer break it. pytest imports this file before the test modules, so the path
is patched before any ForecastService is built or `DEFAULT_DATA_PATH` is imported by name.
"""
from pathlib import Path

from forecast_service import config

config.DEFAULT_DATA_PATH = Path(__file__).parent / "fixtures" / "nifty50_clean_2026-10-01.csv"
