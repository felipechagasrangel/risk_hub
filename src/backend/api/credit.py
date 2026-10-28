from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.core import credit_loss

router = APIRouter(prefix="/credit", tags=["Risco de Crédito"])


class Scenario(BaseModel):
    name: str
    weight: float = Field(gt=0)
    pd_multiplier: float = Field(gt=0, le=10)


class ECLRequest(BaseModel):
    balance: float = Field(100_000, gt=0, description="Saldo devedor (valor contábil bruto)")
    remaining_months: int = Field(36, ge=1, le=420)
    rate: float = Field(0.24, gt=-0.05, lt=5, description="Taxa efetiva do contrato, ao ano")
    amortizing: bool = True
    portfolio: Literal["C1", "C2", "C3", "C4", "C5"] = "C5"
    pd_origination: float = Field(0.04, gt=0, lt=1, description="PD anual na originação")
    pd_now: float = Field(0.05, gt=0, lt=1, description="PD anual hoje")
    lgd: float = Field(0.65, ge=0, le=1)
    sicr_multiple: float = Field(2.5, ge=1, le=20, description="Razão PD atual / PD originação que indica piora significativa")
    days_past_due: int = Field(0, ge=0, le=3650)
    problem_signal: bool = Field(False, description="Indício de que a obrigação não será integralmente honrada")
    scenarios: list[Scenario] = [
        Scenario(name="Otimista", weight=0.2, pd_multiplier=0.8),
        Scenario(name="Base", weight=0.6, pd_multiplier=1.0),
        Scenario(name="Pessimista", weight=0.2, pd_multiplier=1.6),
    ]


@router.post("/ecl")
def compute_ecl(req: ECLRequest):
    return credit_loss.run(req.model_dump())
