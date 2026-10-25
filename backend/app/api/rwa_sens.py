from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core import rwa_sens

router = APIRouter(prefix="/capital", tags=["Capital"])


class Curve(BaseModel):
    name: str
    currency: str = Field(min_length=3, max_length=3, description="Moeda de denominação (categoria)")
    settlement: str = Field(min_length=3, max_length=3, description="Moeda de liquidação")
    dv01: list[float] = Field(description="Variação de valor (R$) para +1 bp em cada vértice")


class DIOption(BaseModel):
    name: str
    curve: str = Field(description="Curva em reais à qual o delta da opção é somado")
    kind: Literal["call", "put"] = Field(description="call de taxa ganha com alta de juros")
    quantity: float = Field(description="Contratos (negativo = vendido)")
    strike: float = Field(gt=-0.05, lt=1, description="Taxa de exercício (decimal)")
    rate: float = Field(gt=-0.05, lt=1, description="Taxa corrente do DI1 subjacente (decimal)")
    vol: float = Field(gt=0, lt=0.2, description="Volatilidade normal anual da taxa (decimal)")
    expiry_du: int = Field(gt=0, description="Dias úteis até o vencimento da opção")
    underlying_du: int = Field(description="Vencimento do DI1 subjacente; deve ser um vértice")


class GIRRRequest(BaseModel):
    curves: list[Curve]
    options: list[DIOption] = []
    brazil_investment_grade: bool = False


@router.post("/rwa-sens/girr-delta")
def compute_girr_delta(req: GIRRRequest):
    n = len(rwa_sens.VERTICES_DU)
    if not req.curves:
        raise HTTPException(422, "Inclua pelo menos uma curva")
    if any(len(c.dv01) != n for c in req.curves):
        raise HTTPException(422, f"Cada curva precisa de {n} sensibilidades, uma por vértice")
    for o in req.options:
        if o.underlying_du not in rwa_sens.VERTICES_DU or o.underlying_du <= o.expiry_du:
            raise HTTPException(422, f"{o.name}: o DI1 subjacente deve vencer num vértice posterior à opção")
    curves = [{**c.model_dump(), "currency": c.currency.upper(), "settlement": c.settlement.upper()}
              for c in req.curves]
    return rwa_sens.girr(curves, [o.model_dump() for o in req.options], req.brazil_investment_grade)
