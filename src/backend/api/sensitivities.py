from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.core import sensitivities

router = APIRouter(prefix="/market", tags=["Risco de Mercado"])


class Shocks(BaseModel):
    pre: float = Field(100, description="Choque paralelo na curva pré, em bps")
    cupom: float = Field(0, description="Choque paralelo no cupom cambial, em bps")
    ipca: float = Field(0, description="Choque paralelo no cupom de IPCA, em bps")
    fx_pct: float = Field(0, description="Variação do dólar, em %")
    vol_pts: float = Field(0, description="Variação da volatilidade, em pontos")


class SensitivityRequest(BaseModel):
    instrument: Literal["ltn", "ntnf", "ntnb", "swap_fx", "ndf", "call_fx", "portfolio"] = "ndf"
    notional: float = Field(10_000_000, gt=0, description="Tamanho em R$")
    maturity: float = Field(2, ge=0.25, le=10)
    pre: float = Field(0.14, gt=-0.05, lt=1)
    cupom: float = Field(0.05, gt=-0.05, lt=1)
    ipca: float = Field(0.07, gt=-0.05, lt=1)
    slope: float = Field(0.0, gt=-0.02, lt=0.02, description="Inclinação das curvas pré e IPCA, por ano")
    spot: float = Field(5.4, gt=0)
    vol: float = Field(0.15, gt=0.01, lt=2)
    shocks: Shocks = Shocks()


@router.post("/sensitivities")
def compute_sensitivities(req: SensitivityRequest):
    return sensitivities.run(req.model_dump())
