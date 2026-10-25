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


class FloatingRequest(BaseModel):
    notional: float = Field(1_000_000, gt=0)
    total_du: int = Field(756, gt=0)
    elapsed_du: int = Field(252, ge=0)
    cdi_realized: float = Field(0.14, gt=-0.05, lt=1, description="CDI médio realizado até hoje, ao ano")
    spread_contract: float = Field(0.01, gt=-0.5, lt=1, description="Spread contratado sobre o CDI, ao ano")
    spread_market: float = Field(0.015, gt=-0.5, lt=1, description="Spread de mercado hoje para o prazo restante")


@router.post("/floating")
def compute_floating(req: FloatingRequest):
    if req.elapsed_du > req.total_du:
        raise HTTPException(422, "Os dias decorridos não podem passar do prazo total")
    return valuation.floating_note(**req.model_dump())


class SwapRequest(BaseModel):
    notional: float = Field(10_000_000, gt=0)
    total_du: int = Field(504, gt=0)
    elapsed_du: int = Field(126, ge=0)
    fixed_rate: float = Field(0.13, gt=-0.05, lt=1, description="Taxa pré contratada, ao ano")
    cdi_realized: float = Field(0.14, gt=-0.05, lt=1, description="CDI médio realizado até hoje, ao ano")
    market_rate: float = Field(0.145, gt=-0.05, lt=1, description="Taxa pré de mercado (DI futuro) para o prazo restante")
    receive_fixed: bool = True


@router.post("/swap")
def compute_swap(req: SwapRequest):
    if req.elapsed_du > req.total_du:
        raise HTTPException(422, "Os dias decorridos não podem passar do prazo total")
    return valuation.swap_di_pre(**req.model_dump())
