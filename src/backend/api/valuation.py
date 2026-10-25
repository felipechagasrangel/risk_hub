from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core import valuation

router = APIRouter(prefix="/valuation", tags=["Apreçamento"])


class BondRequest(BaseModel):
    face: float = Field(1_000_000, gt=0)
    maturity_years: float = Field(3, gt=0, le=30)
    purchase_rate: float = Field(0.13, gt=-0.05, lt=1)
    market_rate: float = Field(0.15, gt=-0.05, lt=1, description="Taxa de mercado após o choque")
    shock_years: float = Field(0.5, ge=0, description="Quando a taxa de mercado muda")
    today_years: float = Field(1, ge=0, description="Data de observação")


@router.post("/bond")
def compute_bond(req: BondRequest):
    if req.shock_years > req.maturity_years or req.today_years > req.maturity_years:
        raise HTTPException(422, "Choque e data de observação devem estar antes do vencimento")
    return valuation.bond_paths(req.face, req.maturity_years, req.purchase_rate,
                                req.market_rate, req.shock_years, req.today_years)
