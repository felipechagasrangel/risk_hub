import inspect
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core import xva

router = APIRouter(prefix="/xva", tags=["XVA"])

# Funções cujo código-fonte pode ser exibido nas páginas (snippets).
SNIPPETS = {f.__name__: f for f in (
    xva.simulate_gbm, xva.simulate_hull_white, xva.hw_zero_bond, xva.swap_mtm, xva.ndf_mtm,
    xva.swap_periodic_mtm, xva.fixed_rate_sensitivity, xva.quote_run, xva.lookback_index,
    xva.apply_collateral, xva.margin_calls, xva.exposure_profile, xva.epe_and_eepe, xva.default_probabilities,
    xva.cva, xva.dva, xva.fva, xva.initial_margin_swap, xva.mva,
)}


@router.get("/source/{name}")
def source(name: str):
    if name not in SNIPPETS:
        raise HTTPException(404, "Snippet não disponível")
    return {"name": name, "module": "backend.core.xva", "code": inspect.getsource(SNIPPETS[name])}


class PathsRequest(BaseModel):
    model: Literal["gbm", "hw"] = "hw"
    maturity: float = Field(5, gt=0, le=30)
    s0: float = Field(5.0, gt=0)
    drift: float = Field(0.04, gt=-1, lt=1)
    sigma: float = Field(0.15, gt=0, lt=2)
    r0: float = Field(0.14, gt=-0.05, lt=1)
    a: float = Field(0.15, gt=0, le=5)
    n_paths: int = Field(10_000, ge=100, le=50_000)
    seed: int = 7


@router.post("/paths")
def compute_paths(req: PathsRequest):
    return xva.model_paths(req.model, req.model_dump(), req.n_paths, req.seed)


class XVARequest(BaseModel):
    instrument: Literal["swap", "ndf"] = "swap"
    receive: bool = Field(True, description="Swap: recebe pré. NDF: comprado em dólar.")
    notional: float = Field(10_000_000, gt=0)
    maturity: float = Field(5, gt=0, le=15)
    rate: float = Field(0.14, gt=-0.05, lt=1, description="Taxa doméstica (base 252)")
    fixed_rate: float = Field(0.14, gt=-0.05, lt=1)
    hw_a: float = Field(0.15, gt=0, le=5)
    hw_sigma: float = Field(0.02, gt=0, lt=0.2)
    spot: float = Field(5.0, gt=0)
    strike: float | None = Field(None, gt=0, description="Sem valor: termo de mercado (a par)")
    foreign_rate: float = Field(0.045, gt=-0.05, lt=1)
    fx_vol: float = Field(0.15, gt=0, lt=2)
    pfe_quantile: float = Field(0.975, gt=0.5, lt=1)
    collateral: bool = False
    threshold: float = Field(0, ge=0)
    mpor_days: int = Field(10, ge=0, le=60)
    cpty_spread: float = Field(0.02, ge=0, lt=1)
    cpty_recovery: float = Field(0.4, ge=0, lt=1)
    own_spread: float = Field(0.01, ge=0, lt=1)
    own_recovery: float = Field(0.4, ge=0, lt=1)
    funding_spread: float = Field(0.01, ge=0, lt=1, description="Spread de captação sobre a taxa livre de risco")
    lend_spread: float = Field(0.003, ge=0, lt=1, description="Spread de aplicação do excesso de caixa")
    initial_margin: bool = True
    n_paths: int = Field(5_000, ge=200, le=20_000)
    seed: int = 7


@router.post("/run")
def compute_xva(req: XVARequest):
    return xva.xva_run(req.model_dump())


class CSARequest(BaseModel):
    notional: float = Field(50_000_000, gt=0)
    maturity: float = Field(3, gt=0, le=15)
    horizon: float = Field(1.5, gt=0, le=5, description="Anos de trajetória simulada")
    rate: float = Field(0.14, gt=-0.05, lt=1)
    fixed_rate: float = Field(0.14, gt=-0.05, lt=1)
    hw_a: float = Field(0.15, gt=0, le=5)
    hw_sigma: float = Field(0.02, gt=0, lt=0.2)
    receive: bool = True
    threshold: float = Field(1_000_000, ge=0)
    mta: float = Field(250_000, ge=0)
    rounding: float = Field(50_000, ge=0)
    independent_amount: float = Field(0, ge=0)
    lag_days: int = Field(1, ge=0, le=20)
    seed: int = 21


@router.post("/csa")
def compute_csa(req: CSARequest):
    if req.horizon > req.maturity:
        raise HTTPException(422, "O horizonte simulado não pode passar do vencimento do swap")
    return xva.csa_run(req.model_dump())


class SwapScenarioRequest(BaseModel):
    notional: float = Field(10_000_000, gt=0)
    maturity: float = Field(5, gt=0, le=10)
    per_year: Literal[0, 1, 2, 4] = Field(2, description="Fluxos por ano; 0 = bullet")
    rate: float = Field(0.14, gt=-0.05, lt=1, description="Taxa pré de mercado; o swap é contratado a par")
    hw_a: float = Field(0.15, gt=0, le=5)
    hw_sigma: float = Field(0.02, gt=0, lt=0.2)
    receive: bool = True
    cpty_spread: float = Field(0.02, ge=0, lt=1)
    cpty_recovery: float = Field(0.4, ge=0, lt=1)
    threshold: float = Field(0, ge=0)
    mpor_days: int = Field(10, ge=0, le=60)
    seed: int = 7


class QuoteRequest(SwapScenarioRequest):
    own_spread: float = Field(0.01, ge=0, lt=1)
    own_recovery: float = Field(0.4, ge=0, lt=1)
    funding_spread: float = Field(0.01, ge=0, lt=1)
    lend_spread: float = Field(0.003, ge=0, lt=1)
    initial_margin: bool = True
    n_paths: int = Field(4_000, ge=200, le=20_000)


@router.post("/quote")
def compute_quote(req: QuoteRequest):
    return xva.quote_run(req.model_dump())


class GridRequest(SwapScenarioRequest):
    rounding: Literal["nearest", "floor"] = "nearest"
    profile_freq: Literal["Diária", "Semanal", "Quinzenal", "Mensal", "Sem CSA"] = "Semanal"
    n_paths: int = Field(1_500, ge=200, le=5_000)


@router.post("/margin-grid")
def compute_margin_grid(req: GridRequest):
    return xva.margin_grid_run(req.model_dump())
