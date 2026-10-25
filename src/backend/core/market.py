"""Risco de mercado: VaR paramétrico, histórico, Monte Carlo, Expected Shortfall e backtesting.

Convenção: perdas são números positivos. Um VaR de 1.000 significa
"com probabilidade `confidence`, não perderemos mais que 1.000 no horizonte".
"""

from math import sqrt

import numpy as np
from statistics import NormalDist

TRADING_DAYS = 252
_N = NormalDist()


def simulate_returns(n_days: int, mu_annual: float, sigma_annual: float,
                     distribution: str, df: float, seed: int) -> np.ndarray:
    """Gera uma série sintética de retornos diários.

    Com distribuição t de Student a variância é reescalada para 1, de modo que
    a volatilidade seja a mesma da normal — só as caudas ficam mais pesadas.
    """
    rng = np.random.default_rng(seed)
    if distribution == "t":
        z = rng.standard_t(df, n_days) * sqrt((df - 2) / df)
    else:
        z = rng.standard_normal(n_days)
    mu_d = mu_annual / TRADING_DAYS
    sigma_d = sigma_annual / sqrt(TRADING_DAYS)
    return mu_d + sigma_d * z


def parametric_var(value: float, mu_d: float, sigma_d: float,
                   confidence: float, horizon: int) -> tuple[float, float]:
    """VaR e ES delta-normal: assume retornos normais com média e desvio estimados."""
    z = _N.inv_cdf(confidence)
    mu_h, sigma_h = mu_d * horizon, sigma_d * sqrt(horizon)
    var = value * (z * sigma_h - mu_h)
    es = value * (sigma_h * _N.pdf(z) / (1 - confidence) - mu_h)
    return var, es


def historical_var(value: float, returns: np.ndarray,
                   confidence: float, horizon: int) -> tuple[float, float]:
    """VaR e ES históricos: quantil empírico das perdas, escalado por raiz do tempo."""
    losses = -value * returns
    var_1d = float(np.quantile(losses, confidence))
    es_1d = float(losses[losses >= var_1d].mean())
    scale = sqrt(horizon)
    return var_1d * scale, es_1d * scale


def monte_carlo_var(value: float, mu_d: float, sigma_d: float, confidence: float,
                    horizon: int, n_sims: int, seed: int) -> tuple[float, float, np.ndarray]:
    """VaR e ES por Monte Carlo com reavaliação completa (preço log-normal / GBM)."""
    rng = np.random.default_rng(seed + 1)
    z = rng.standard_normal(n_sims)
    growth = np.exp((mu_d - 0.5 * sigma_d**2) * horizon + sigma_d * sqrt(horizon) * z)
    losses = value * (1 - growth)
    var = float(np.quantile(losses, confidence))
    es = float(losses[losses >= var].mean())
    return var, es, losses


def histogram(values: np.ndarray, bins: int = 60) -> list[dict]:
    counts, edges = np.histogram(values, bins=bins)
    return [
        {"x": float((edges[i] + edges[i + 1]) / 2), "count": int(c)}
        for i, c in enumerate(counts)
    ]


def basel_traffic_light(exceptions: int, observations: int, confidence: float) -> str:
    """Zonas do semáforo de Basileia (calibradas para 250 observações a 99%)."""
    if observations != 250 or abs(confidence - 0.99) > 1e-9:
        return "n/a"
    if exceptions <= 4:
        return "verde"
    if exceptions <= 9:
        return "amarela"
    return "vermelha"


def backtest(value: float, returns: np.ndarray, confidence: float,
             window: int, test_days: int) -> dict:
    """Backtest de VaR 1 dia com janela móvel: conta quantas vezes a perda real superou o VaR."""
    n = len(returns)
    start = max(window, n - test_days)
    z = _N.inv_cdf(confidence)
    points = []
    exc_param = exc_hist = 0
    for t in range(start, n):
        past = returns[t - window:t]
        v_param = value * (z * past.std(ddof=1) - past.mean())
        v_hist = float(np.quantile(-value * past, confidence))
        pnl = value * returns[t]
        b_param, b_hist = -pnl > v_param, -pnl > v_hist
        exc_param += b_param
        exc_hist += b_hist
        points.append({
            "day": t, "pnl": pnl, "var_parametric": -v_param, "var_historical": -v_hist,
            "breach_parametric": bool(b_param), "breach_historical": bool(b_hist),
        })
    obs = n - start
    return {
        "observations": obs,
        "expected_exceptions": obs * (1 - confidence),
        "exceptions_parametric": int(exc_param),
        "exceptions_historical": int(exc_hist),
        "zone_parametric": basel_traffic_light(int(exc_param), obs, confidence),
        "zone_historical": basel_traffic_light(int(exc_hist), obs, confidence),
        "points": points,
    }


def portfolio_var(values: list[float], vols_annual: list[float], corr: list[list[float]],
                  confidence: float, horizon: int) -> dict:
    """VaR paramétrico de carteira: mostra o efeito diversificação e o VaR por componente."""
    v = np.asarray(values, dtype=float)
    sigma = np.asarray(vols_annual, dtype=float) / sqrt(TRADING_DAYS) * sqrt(horizon)
    rho = np.asarray(corr, dtype=float)
    cov = np.outer(sigma, sigma) * rho
    z = _N.inv_cdf(confidence)

    exposures = v  # sensibilidade em moeda a um retorno de 100%
    port_sigma = float(sqrt(exposures @ cov @ exposures))
    individual = z * np.abs(exposures) * sigma
    diversified = z * port_sigma
    # VaR componente (Euler): soma exatamente o VaR diversificado
    marginal = z * (cov @ exposures) / port_sigma if port_sigma > 0 else np.zeros_like(v)
    component = exposures * marginal
    return {
        "individual_var": individual.tolist(),
        "undiversified_var": float(individual.sum()),
        "diversified_var": diversified,
        "diversification_benefit": float(individual.sum() - diversified),
        "component_var": component.tolist(),
    }
