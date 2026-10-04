"""
Input contract for the explainer and chat (PRD 7.3).

SimulationContext is what the backend sends AFTER payoff, risk and suitability
engines have run. The LLM never computes these numbers; it only explains them.
"""
from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator

TENOR_MIN_DAYS = 30
TENOR_MAX_DAYS = 1095


class SimMode(str, Enum):
    A = "A"  # ML forecast: low/base/high = P5/P50/P95
    B = "B"  # manual shock


class RiskAppetite(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Verdict(str, Enum):
    SUITABLE = "Suitable"
    CAUTION = "Caution"
    NOT_SUITABLE = "Not suitable"


class BarrierType(str, Enum):
    EUROPEAN = "european"
    AMERICAN = "american"


# ---------- Product terms ----------
class _BaseTerms(BaseModel):
    tenor_days: int = Field(ge=TENOR_MIN_DAYS, le=TENOR_MAX_DAYS)


class ELNTerms(_BaseTerms):
    product: Literal["ELN"] = "ELN"
    underlying: str
    notional: float = Field(gt=0)
    strike_pct: float = Field(gt=0, description="% of initial level, e.g. 100")
    barrier_pct: Optional[float] = Field(default=None, gt=0, description="None = plain ELN")
    barrier_type: Optional[BarrierType] = None
    coupon_pct_pa: float = Field(ge=0)

    @model_validator(mode="after")
    def _barrier_rules(self):
        if self.barrier_pct is not None:
            if self.barrier_pct >= self.strike_pct:
                raise ValueError("barrier_pct must be below strike_pct")
            if self.barrier_type is None:
                raise ValueError("barrier_type required when barrier_pct is set")
        return self


class DCDTerms(_BaseTerms):
    product: Literal["DCD"] = "DCD"
    currency_pair: str
    deposit_amount: float = Field(gt=0)
    strike_rate: float = Field(gt=0)
    enhanced_rate_pct_pa: float = Field(ge=0)


class CPNTerms(_BaseTerms):
    product: Literal["CPN"] = "CPN"
    underlying: str
    notional: float = Field(gt=0)
    protection_pct: float = Field(gt=0, le=100)
    participation_pct: float = Field(gt=0)
    cap_pct: Optional[float] = Field(default=None, gt=0)


ProductTerms = Annotated[Union[ELNTerms, DCDTerms, CPNTerms], Field(discriminator="product")]


# ---------- Client profile ----------
class ClientProfile(BaseModel):
    risk_appetite: RiskAppetite
    investment_horizon_days: int = Field(gt=0)
    loss_tolerance_pct: float = Field(ge=0, le=100)
    concentration_pct: float = Field(ge=0, le=100, description="Share of portfolio in this product/underlying")


# ---------- Engine outputs ----------
class CaseResult(BaseModel):
    """One scenario. Mode A: low/base/high. Mode B: one per shock."""
    label: str  # "low" | "base" | "high" | "-10%" | ...
    shock_pct: Optional[float] = None  # Mode B only
    terminal_level: Optional[float] = None
    payoff: float
    return_pct: float
    knocked_in: Optional[bool] = None  # ELN with barrier only


class DistributionMetrics(BaseModel):
    """Mode A only: computed over all sample paths."""
    prob_loss: float = Field(ge=0, le=1)
    prob_knock_in: Optional[float] = Field(default=None, ge=0, le=1)  # ELN only
    payoff_p5: float
    payoff_p50: float
    payoff_p95: float


class ForecastMeta(BaseModel):
    """Mode A only: model card."""
    model_name: str
    training_start: date
    training_end: date
    as_of: date
    drift_assumption: str
    backtest_band_coverage: float = Field(ge=0, le=1)
    backtest_base_mape: float
    backtest_naive_mape: float


class SuitabilityFlag(BaseModel):
    rule: str
    severity: Literal["caution", "not_suitable"]
    message: str


class SuitabilityResult(BaseModel):
    verdict: Verdict
    flags: list[SuitabilityFlag] = Field(default_factory=list)


class SimulationContext(BaseModel):
    simulation_id: str
    mode: SimMode
    currency: str
    terms: ProductTerms
    profile: ClientProfile
    cases: list[CaseResult] = Field(min_length=1)
    suitability: SuitabilityResult
    distribution: Optional[DistributionMetrics] = None
    forecast_meta: Optional[ForecastMeta] = None

    @model_validator(mode="after")
    def _mode_consistency(self):
        if self.mode == SimMode.A:
            if self.distribution is None or self.forecast_meta is None:
                raise ValueError("Mode A requires distribution and forecast_meta")
            if {c.label for c in self.cases} != {"low", "base", "high"}:
                raise ValueError("Mode A requires exactly low, base and high cases")
        else:
            if self.distribution is not None or self.forecast_meta is not None:
                raise ValueError("Mode B must not include distribution or forecast_meta")
        return self
