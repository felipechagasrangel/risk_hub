from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core import stress

router = APIRouter(prefix="/market", tags=["Risco de Mercado"])


class StressPosition(BaseModel):
    name: str
    factor: Literal["equity", "fx", "rates"]
    value: float
    vol_annual: float = Field(gt=0, description="Volatilidade anual do preço, usada no VaR")
    duration: float = Field(0, ge=0, description="Duration modificada (só para juros)")
    convexity: float = Field(0, ge=0, description="Convexidade (só para juros)")


class FactorCorrelation(BaseModel):
    equity_fx: float = Field(-0.4, ge=-1, le=1)
    equity_rates: float = Field(0.3, ge=-1, le=1)
    fx_rates: float = Field(-0.2, ge=-1, le=1)


class Shocks(BaseModel):
    equity: float = Field(description="Variação do índice de ações (decimal)")
    fx: float = Field(description="Variação do câmbio (decimal)")
    rates: float = Field(description="Variação da taxa de juros (decimal, 0,01 = 100 bps)")


class StressRequest(BaseModel):
    positions: list[StressPosition]
    correlation: FactorCorrelation = FactorCorrelation()
    confidence: float = Field(0.99, gt=0.5, lt=1)
    loss_limit: float = Field(300_000, gt=0, description="Perda máxima tolerada (stress reverso)")
    custom: Shocks | None = None


@router.post("/stress")
def compute_stress(req: StressRequest):
    if not req.positions:
        raise HTTPException(422, "Inclua pelo menos uma posição")
    return stress.run([p.model_dump() for p in req.positions], req.correlation.model_dump(),
                      req.confidence, req.loss_limit,
                      req.custom.model_dump() if req.custom else None)
