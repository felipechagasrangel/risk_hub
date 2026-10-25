from math import sqrt
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core import market

router = APIRouter(prefix="/market", tags=["Risco de Mercado"])


class VaRRequest(BaseModel):
    value: float = Field(1_000_000, gt=0, description="Valor da posição")
    mu_annual: float = Field(0.08, description="Retorno esperado anual")
    sigma_annual: float = Field(0.25, gt=0, description="Volatilidade anual")
    distribution: Literal["normal", "t"] = "normal"
    df: float = Field(4, gt=2, description="Graus de liberdade da t de Student")
    confidence: float = Field(0.99, gt=0.5, lt=1)
    horizon: int = Field(1, ge=1, le=250, description="Horizonte em dias úteis")
    n_days: int = Field(1000, ge=300, le=5000, description="Tamanho do histórico")
    n_sims: int = Field(10_000, ge=100, le=200_000)
    window: int = Field(250, ge=50, le=1000, description="Janela do backtest")
    seed: int = 42


@router.post("/var")
def compute_var(req: VaRRequest):
    if req.n_days < req.window + 50:
        raise HTTPException(422, "n_days precisa ser pelo menos window + 50")
    r = market.simulate_returns(req.n_days, req.mu_annual, req.sigma_annual,
                                req.distribution, req.df, req.seed)
    mu_d, sigma_d = float(r.mean()), float(r.std(ddof=1))

    p_var, p_es = market.parametric_var(req.value, mu_d, sigma_d, req.confidence, req.horizon)
    h_var, h_es = market.historical_var(req.value, r, req.confidence, req.horizon)
    m_var, m_es, mc_losses = market.monte_carlo_var(
        req.value, mu_d, sigma_d, req.confidence, req.horizon, req.n_sims, req.seed)

    hist_losses = -req.value * r * sqrt(req.horizon)
    return {
        "estimates": {"mu_daily": mu_d, "sigma_daily": sigma_d,
                      "sigma_annual": sigma_d * sqrt(market.TRADING_DAYS)},
        "methods": {
            "parametric": {"var": p_var, "es": p_es},
            "historical": {"var": h_var, "es": h_es},
            "monte_carlo": {"var": m_var, "es": m_es},
        },
        "histogram_historical": market.histogram(hist_losses),
        "histogram_monte_carlo": market.histogram(mc_losses),
        "returns": r.tolist(),
        "backtest": market.backtest(req.value, r, req.confidence, req.window,
                                    test_days=250),
    }


class Asset(BaseModel):
    name: str
    value: float
    vol_annual: float = Field(gt=0)


class PortfolioRequest(BaseModel):
    assets: list[Asset]
    correlation: list[list[float]]
    confidence: float = Field(0.99, gt=0.5, lt=1)
    horizon: int = Field(1, ge=1, le=250)


@router.post("/portfolio-var")
def compute_portfolio_var(req: PortfolioRequest):
    n = len(req.assets)
    if len(req.correlation) != n or any(len(row) != n for row in req.correlation):
        raise HTTPException(422, "A matriz de correlação deve ser n×n")
    result = market.portfolio_var(
        [a.value for a in req.assets], [a.vol_annual for a in req.assets],
        req.correlation, req.confidence, req.horizon)
    return {"assets": [a.name for a in req.assets], **result}
