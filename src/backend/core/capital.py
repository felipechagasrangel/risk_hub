"""Capital regulatório: RWA (abordagem padronizada e IRB) e índices de Basileia."""

from math import exp, log, sqrt

from statistics import NormalDist

_N = NormalDist()
CAPITAL_TO_RWA = 12.5  # 1 / 8%: converte uma exigência de capital em RWA equivalente


def standardized_rwa(exposures: list[dict]) -> list[dict]:
    """Cada exposição: EAD = valor × CCF; RWA = EAD × fator de ponderação de risco (FPR)."""
    rows = []
    for e in exposures:
        ead = e["amount"] * e["ccf"]
        rows.append({**e, "ead": ead, "rwa": ead * e["risk_weight"]})
    return rows


def capital_ratios(rwa_credit: float, capital_market: float, capital_operational: float,
                   cet1: float, at1: float, tier2: float,
                   conservation_buffer: float, countercyclical_buffer: float) -> dict:
    rwa_market = capital_market * CAPITAL_TO_RWA
    rwa_operational = capital_operational * CAPITAL_TO_RWA
    rwa_total = rwa_credit + rwa_market + rwa_operational
    buffers = conservation_buffer + countercyclical_buffer
    tier1 = cet1 + at1
    total = tier1 + tier2

    def ratio(x: float) -> float:
        return x / rwa_total if rwa_total else 0.0

    requirements = {
        "cet1": 0.045 + buffers,
        "tier1": 0.06 + buffers,
        "total": 0.08 + buffers,
    }
    ratios = {"cet1": ratio(cet1), "tier1": ratio(tier1), "total": ratio(total)}
    return {
        "rwa": {"credit": rwa_credit, "market": rwa_market,
                "operational": rwa_operational, "total": rwa_total},
        "ratios": ratios,
        "requirements": requirements,
        "surplus": {k: (ratios[k] - requirements[k]) * rwa_total for k in ratios},
    }


def irb_correlation(pd: float, asset_class: str) -> float:
    if asset_class == "mortgage":
        return 0.15
    if asset_class == "revolving":
        return 0.04
    if asset_class == "corporate":
        w = (1 - exp(-50 * pd)) / (1 - exp(-50))
        return 0.12 * w + 0.24 * (1 - w)
    w = (1 - exp(-35 * pd)) / (1 - exp(-35))  # outros varejo
    return 0.03 * w + 0.16 * (1 - w)


def irb_capital(pd: float, lgd: float, maturity: float, asset_class: str) -> dict:
    """Fórmula IRB de Basileia (modelo de Vasicek de um fator, 99,9%)."""
    pd = max(pd, 0.0003)
    r = irb_correlation(pd, asset_class)
    conditional_pd = _N.cdf((_N.inv_cdf(pd) + sqrt(r) * _N.inv_cdf(0.999)) / sqrt(1 - r))
    k = lgd * conditional_pd - pd * lgd  # perda inesperada = perda no estresse − perda esperada
    if asset_class == "corporate":
        b = (0.11852 - 0.05478 * log(pd)) ** 2
        k *= (1 + (maturity - 2.5) * b) / (1 - 1.5 * b)
    return {
        "pd": pd, "correlation": r, "conditional_pd": conditional_pd,
        "expected_loss_rate": pd * lgd, "capital_k": k, "risk_weight": k * CAPITAL_TO_RWA,
    }
