"""Rotas de IRRBB: indexadores e risco de base, ΔNII dinâmico, métrica regulatória e CSRBB."""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.core import csrbb, irrbb_indexers, irrbb_regulatory

router = APIRouter(prefix="/irrbb", tags=["IRRBB"])


class IndexedItem(BaseModel):
    name: str
    side: Literal["asset", "liability"]
    amount: float = Field(ge=0)
    indexer: Literal["pre", "cdi", "selic", "poupanca", "tr", "ipca", "zero"]
    rate: float = Field(0, description="Taxa contratada (prefixados)")
    pct: float = Field(1.0, ge=0, le=3, description="% do CDI")
    spread: float = Field(0, description="Spread sobre o indexador")
    months: int = Field(12, ge=1, le=360, description="Prazo médio (prefixados): define quanto renova por mês")
    growth: float = Field(0, ge=-0.5, le=1, description="Crescimento anual (balanço dinâmico)")


class BasisRequest(BaseModel):
    selic: float = Field(0.14, ge=0, le=0.5)
    ipca: float = Field(0.045, ge=-0.05, le=0.5)
    ramp_months: int = Field(6, ge=1, le=12)
    shock_bps: int = Field(300, ge=-1000, le=1000)
    ipca_shock_bps: int = Field(200, ge=-1000, le=1000)
    items: list[IndexedItem]


@router.post("/basis")
def compute_basis(req: BasisRequest):
    return irrbb_indexers.basis_run(req.model_dump())


class CopomScenario(BaseModel):
    name: str
    delta_bps: int = Field(ge=-1500, le=1500)
    ramp_months: int = Field(ge=1, le=24)


class DynamicNIIRequest(BaseModel):
    selic: float = Field(0.14, ge=0, le=0.5)
    ipca: float = Field(0.045)
    horizon: int = Field(24, ge=12, le=36)
    scenarios: list[CopomScenario] = Field(min_length=2, description="O primeiro é a referência")
    items: list[IndexedItem]


@router.post("/dynamic-nii")
def compute_dynamic_nii(req: DynamicNIIRequest):
    return irrbb_indexers.dynamic_run(req.model_dump())


class CurvePoint(BaseModel):
    tenor: float = Field(gt=0)
    rate: float


class Shocks(BaseModel):
    parallel: float
    short: float
    long: float


class Currency(BaseModel):
    code: str
    fx: float = Field(gt=0, description="Reais por unidade da moeda")
    curve: list[CurvePoint] = Field(min_length=2)
    shocks: Shocks


class RegPosition(BaseModel):
    name: str
    currency: str
    side: Literal["asset", "liability"]
    amount: float = Field(ge=0)
    rate: float
    margin: float = Field(0, description="Margem comercial embutida na taxa")
    repricing: float = Field(gt=0, le=40)


class RegulatoryRequest(BaseModel):
    tier1: float = Field(gt=0)
    floor: Literal["none", "zero", "eba"] = "eba"
    margins: Literal["include_rf", "include_spread", "exclude"] = "include_rf"
    currencies: list[Currency] = Field(min_length=1)
    positions: list[RegPosition]


@router.post("/regulatory")
def compute_regulatory(req: RegulatoryRequest):
    return irrbb_regulatory.run(req.model_dump())


class Bond(BaseModel):
    name: str
    rating: Literal["AAA", "AA", "A", "BBB", "BB"]
    notional: float = Field(gt=0)
    coupon: float
    maturity: float = Field(gt=0, le=30)
    spread: float = Field(ge=-0.01, le=0.3)
    accounting: Literal["vjora", "custo"] = "vjora"
    swapped: bool = False


class CSRBBRequest(BaseModel):
    risk_free: float = Field(0.135)
    severity: float = Field(1.0, ge=0, le=5)
    rate_shock_bps: int = Field(0, ge=-1000, le=1000)
    tier1: float = Field(1_200, gt=0)
    spread_shocks: dict[str, float] = dict(csrbb.DEFAULT_SPREAD_SHOCKS)
    bonds: list[Bond] = Field(min_length=1)


@router.post("/csrbb")
def compute_csrbb(req: CSRBBRequest):
    return csrbb.run(req.model_dump())
