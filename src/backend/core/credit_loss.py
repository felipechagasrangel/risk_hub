"""Perda esperada de crédito (Resolução CMN nº 4.966 e Resolução BCB nº 352).

- Estágio 1: sem aumento significativo do risco de crédito → perda esperada de 12 meses.
- Estágio 2: aumento significativo (presumido com atraso > 30 dias) → perda esperada da vida inteira.
- Estágio 3: ativo com problema de recuperação (atraso > 90 dias ou indício de não pagamento)
  → perda esperada com o default já ocorrido.

Para ativos inadimplidos, a Res. BCB 352 (art. 76 e Anexo I) fixa níveis mínimos de provisão para
perda incorrida, por carteira (C1 a C5) e meses de atraso desde o inadimplemento.

Simplificações didáticas: PD constante ao ano (curva de sobrevivência geométrica), LGD constante,
cenários macroeconômicos como multiplicadores da PD e critério de aumento significativo por razão
entre a PD atual e a da originação (o critério real é definido por cada instituição).
"""

import numpy as np

# Anexo I da Res. BCB 352: % mínimo de provisão por meses de atraso desde o inadimplemento
INCURRED_LOSS_FLOOR = {
    "C1": [5.5, 10.0, 14.5, 19.0, 23.5, 28.0, 32.5, 37.0, 41.5, 46.0, 50.5, 55.0, 59.5, 64.0, 68.5, 73.0, 77.5, 82.0, 86.5, 91.0, 95.5, 100.0],
    "C2": [30.0, 33.4, 36.8, 40.2, 43.6, 47.0, 50.4, 53.8, 57.2, 60.6, 64.0, 67.4, 70.8, 74.2, 77.6, 81.0, 84.4, 87.8, 91.2, 94.6, 98.0, 100.0],
    "C3": [45.0, 48.7, 52.4, 56.1, 59.8, 63.5, 67.2, 70.9, 74.6, 78.3, 82.0, 85.7, 89.4, 93.1, 96.8, 100.0],
    "C4": [35.0, 39.5, 44.0, 48.5, 53.0, 57.5, 62.0, 66.5, 71.0, 75.5, 80.0, 84.5, 89.0, 93.5, 98.0, 100.0],
    "C5": [50.0, 53.4, 56.8, 60.2, 63.6, 67.0, 70.4, 73.8, 77.2, 80.6, 84.0, 87.4, 90.8, 94.2, 97.6, 100.0],
}
SICR_DAYS = 30      # art. 38, § 7º: presunção de aumento significativo
PROBLEM_DAYS = 90   # art. 3º, I: ativo com problema de recuperação de crédito


def stage(days_past_due: int, pd_now: float, pd_origination: float, sicr_multiple: float,
          problem_signal: bool = False) -> int:
    """Estágio do instrumento: atraso e indício de não pagamento primeiro, depois a piora da PD."""
    if days_past_due > PROBLEM_DAYS or problem_signal:
        return 3
    if days_past_due > SICR_DAYS or pd_now >= sicr_multiple * pd_origination:
        return 2
    return 1


def exposure_schedule(balance: float, months: int, annual_rate: float, amortizing: bool) -> np.ndarray:
    """EAD no início de cada mês: tabela Price (parcelas iguais) ou bullet (saldo constante)."""
    if not amortizing:
        return np.full(months, balance)
    i = (1 + annual_rate) ** (1 / 12) - 1
    payment = balance * i / (1 - (1 + i) ** -months)
    out, b = [], balance
    for _ in range(months):
        out.append(b)
        b = b * (1 + i) - payment
    return np.array(out)


def marginal_pd(annual_pd: float, months: int) -> np.ndarray:
    """Probabilidade de default em cada mês, com sobrevivência S(t) = (1 − PD)^t."""
    survival = (1 - annual_pd) ** (np.arange(months + 1) / 12)
    return survival[:-1] - survival[1:]


def expected_loss(ead: np.ndarray, annual_pd: float, lgd: float, annual_rate: float, horizon_months: int) -> float:
    """ECL = Σ PD marginal(t) × LGD × EAD(t) × fator de desconto(t), até o horizonte."""
    m = min(horizon_months, len(ead))
    pd = marginal_pd(annual_pd, m)
    discount = (1 + annual_rate) ** (-(np.arange(1, m + 1)) / 12)  # taxa efetiva do contrato
    return float(np.sum(pd * lgd * ead[:m] * discount))


def weighted_expected_loss(ead: np.ndarray, annual_pd: float, lgd: float, annual_rate: float,
                           horizon_months: int, scenarios: list[dict]) -> tuple[float, list[dict]]:
    """Perda esperada ponderada por cenários macroeconômicos (visão prospectiva)."""
    rows = []
    for s in scenarios:
        pd = min(annual_pd * s["pd_multiplier"], 0.9999)
        rows.append({**s, "pd": pd, "ecl": expected_loss(ead, pd, lgd, annual_rate, horizon_months)})
    total_weight = sum(r["weight"] for r in rows)
    return sum(r["weight"] * r["ecl"] for r in rows) / total_weight, rows


def incurred_loss_floor(portfolio: str, days_past_due: int) -> float:
    """Piso do Anexo I da Res. BCB 352, em fração do saldo, para ativo inadimplido."""
    if days_past_due <= PROBLEM_DAYS:
        return 0.0
    months_in_default = (days_past_due - PROBLEM_DAYS - 1) // 30
    table = INCURRED_LOSS_FLOOR[portfolio]
    return table[min(months_in_default, len(table) - 1)] / 100


def provision(p: dict, days_past_due: int) -> dict:
    """Provisão de um contrato num dado atraso: estágio, perda esperada e piso de perda incorrida."""
    months = p["remaining_months"]
    ead = exposure_schedule(p["balance"], months, p["rate"], p["amortizing"])
    st = stage(days_past_due, p["pd_now"], p["pd_origination"], p["sicr_multiple"], p["problem_signal"])
    if st == 3:
        ecl, scenario_rows = p["lgd"] * p["balance"], []  # default já ocorrido: perda = LGD × saldo
    else:
        horizon = 12 if st == 1 else months
        ecl, scenario_rows = weighted_expected_loss(ead, p["pd_now"], p["lgd"], p["rate"], horizon, p["scenarios"])
    floor = incurred_loss_floor(p["portfolio"], days_past_due) * p["balance"]
    return {
        "stage": st, "ecl": ecl, "floor": floor, "provision": max(ecl, floor),
        "coverage": max(ecl, floor) / p["balance"], "scenarios": scenario_rows,
    }


def run(p: dict) -> dict:
    """Provisão no atraso informado, a comparação 12 meses × vida inteira e a curva por dias de atraso."""
    months = p["remaining_months"]
    ead = exposure_schedule(p["balance"], months, p["rate"], p["amortizing"])
    ecl_12m, _ = weighted_expected_loss(ead, p["pd_now"], p["lgd"], p["rate"], 12, p["scenarios"])
    ecl_life, _ = weighted_expected_loss(ead, p["pd_now"], p["lgd"], p["rate"], months, p["scenarios"])
    current = provision(p, p["days_past_due"])
    curve = []
    for d in range(0, 721, 5):
        r = provision({**p, "problem_signal": False}, d)
        curve.append({"days": d, "stage": r["stage"], "ecl": r["ecl"], "floor": r["floor"], "provision": r["provision"]})
    return {
        "current": current,
        "ecl_12m": ecl_12m,
        "ecl_lifetime": ecl_life,
        "ead": [{"month": m + 1, "ead": float(v)} for m, v in enumerate(ead)],
        "curve": curve,
        "floor_table": INCURRED_LOSS_FLOOR,
    }
