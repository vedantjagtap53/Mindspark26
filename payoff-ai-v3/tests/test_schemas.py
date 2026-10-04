import pytest
from pydantic import ValidationError

from rag.schemas import SimulationContext


def test_valid_mode_a(eln_mode_a):
    ctx = SimulationContext.model_validate(eln_mode_a)
    assert ctx.terms.product == "ELN"
    assert ctx.suitability.verdict.value == "Not suitable"


def test_mode_a_requires_forecast_meta(eln_mode_a):
    eln_mode_a.pop("forecast_meta")
    with pytest.raises(ValidationError):
        SimulationContext.model_validate(eln_mode_a)


def test_mode_b_rejects_distribution(eln_mode_a):
    eln_mode_a["mode"] = "B"
    with pytest.raises(ValidationError):
        SimulationContext.model_validate(eln_mode_a)


def test_barrier_must_be_below_strike(eln_mode_a):
    eln_mode_a["terms"]["barrier_pct"] = 105
    with pytest.raises(ValidationError):
        SimulationContext.model_validate(eln_mode_a)


def test_tenor_out_of_range(eln_mode_a):
    eln_mode_a["terms"]["tenor_days"] = 1200
    with pytest.raises(ValidationError):
        SimulationContext.model_validate(eln_mode_a)
