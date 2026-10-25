from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core import rwa_sens

router = APIRouter(prefix="/capital", tags=["Capital"])


class Curve(BaseModel):
    name: str
    currency: str = Field(min_length=3, max_length=3, description="Moeda de denominação (categoria)")
    settlement: str = Field(min_length=3, max_length=3, description="Moeda de liquidação")
    dv01: list[float] = Field(description="Variação de valor (R$) para +1 bp em cada vértice")


class GIRRRequest(BaseModel):
    curves: list[Curve]
    brazil_investment_grade: bool = False


@router.post("/rwa-sens/girr-delta")
def compute_girr_delta(req: GIRRRequest):
    n = len(rwa_sens.VERTICES_DU)
    if not req.curves:
        raise HTTPException(422, "Inclua pelo menos uma curva")
    if any(len(c.dv01) != n for c in req.curves):
        raise HTTPException(422, f"Cada curva precisa de {n} sensibilidades, uma por vértice")
    curves = [{**c.model_dump(), "currency": c.currency.upper(), "settlement": c.settlement.upper()}
              for c in req.curves]
    return rwa_sens.girr_delta(curves, req.brazil_investment_grade)
