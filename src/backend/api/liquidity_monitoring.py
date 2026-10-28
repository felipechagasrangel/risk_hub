"""Rotas de liquidez: concentração de funding, plano de contingência e liquidez intradiária."""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core import liquidity_monitoring

router = APIRouter(prefix="/liquidity", tags=["Liquidez"])


class FundingSource(BaseModel):
    name: str
    product: str
    amount: float = Field(gt=0)
    days: int = Field(ge=0, description="Dias até o vencimento")


class Indicator(BaseModel):
    name: str
    metric: Literal["top10_share", "top1_share", "hhi_counterparty", "short_term_share", "coverage_top3"] | None = None
    value: float = 0
    amber: float
    red: float
    higher_is_worse: bool = True
    unit: Literal["pct", "ratio", "bps", "x"] = "pct"


class FundingRequest(BaseModel):
    buffer: float = Field(ge=0)
    sources: list[FundingSource] = Field(min_length=1)
    indicators: list[Indicator]


@router.post("/funding")
def compute_funding(req: FundingRequest):
    return liquidity_monitoring.funding_run(req.model_dump())


class IntradayFlow(BaseModel):
    name: str
    kind: Literal["in", "out"]
    amounts: list[float]
    time_critical: bool = True


class IntradayRequest(BaseModel):
    opening: float = Field(ge=0, description="Saldo de abertura da conta de reservas")
    collateral: float = Field(0, ge=0, description="Títulos disponíveis para o redesconto intradia")
    haircut: float = Field(0.05, ge=0, le=1)
    flows: list[IntradayFlow]
    delay_slots: int = Field(2, ge=0, le=9)
    inflow_failure: float = Field(0.2, ge=0, le=1)
    queue_noncritical: bool = False


@router.post("/intraday")
def compute_intraday(req: IntradayRequest):
    n = len(liquidity_monitoring.SLOTS)
    if any(len(f.amounts) != n for f in req.flows):
        raise HTTPException(422, f"Cada fluxo precisa de {n} valores, um por horário")
    return liquidity_monitoring.intraday(req.model_dump())
