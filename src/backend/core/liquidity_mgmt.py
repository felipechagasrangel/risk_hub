"""Gestão de liquidez: gap por prazo, horizonte de sobrevivência e preço de transferência (FTP).

Gap de liquidez: entradas e saídas contratuais por faixa de prazo, com um cenário de estresse que
reduz as entradas (atrasos, não renovações de crédito) e as renovações de captações. O colchão de
ativos líquidos entra no início. O horizonte de sobrevivência é o prazo até o saldo acumulado
ficar negativo.

FTP: cada produto é cobrado (ativos) ou remunerado (passivos) pela curva base do prazo mais um
prêmio de liquidez que cresce com o prazo — a tesouraria compra e vende funding das áreas de
negócio e fica com o descasamento.
"""

import numpy as np

BUCKETS = ["até 1 dia", "1–30 dias", "1–3 meses", "3–6 meses", "6–12 meses", "1–2 anos", "2–5 anos", "acima de 5 anos"]
BUCKET_END_DAYS = [1, 30, 90, 180, 365, 730, 1825, 3650]


def liquidity_gap(items: list[dict], buffer: float, buffer_haircut: float, stressed: bool) -> dict:
    """Fluxos por faixa e saldo acumulado. Cada item: name, kind ('in'/'out'), stress e valores por faixa.

    No estresse, uma entrada recebe só `stress` (fração) do contratual; numa saída, `stress` é a
    fração que NÃO é renovada (e sai de fato do caixa). Sem estresse, saídas são renovadas
    conforme `base_rollover`.
    """
    n = len(BUCKETS)
    inflows, outflows = np.zeros(n), np.zeros(n)
    for it in items:
        amounts = np.array(it["amounts"], dtype=float)
        if it["kind"] == "in":
            inflows += amounts * (it["stress"] if stressed else 1.0)
        else:
            leaves = it["stress"] if stressed else 1 - it["base_rollover"]
            outflows += amounts * leaves
    start = buffer * (1 - (buffer_haircut if stressed else 0.0))
    net = inflows - outflows
    cumulative = start + np.cumsum(net)
    return {"inflows": inflows, "outflows": outflows, "net": net, "cumulative": cumulative, "start": start}


def survival_horizon(cumulative: np.ndarray, start: float) -> float | None:
    """Dias até o caixa acumulado ficar negativo, interpolando dentro da faixa; None se sobrevive."""
    previous_balance, previous_day = start, 0
    for balance, end_day in zip(cumulative, BUCKET_END_DAYS):
        if balance < 0:
            share = previous_balance / (previous_balance - balance) if previous_balance > 0 else 0.0
            return previous_day + share * (end_day - previous_day)
        previous_balance, previous_day = balance, end_day
    return None


def liquidity_premium(term: float, curve: list[dict]) -> float:
    """Prêmio de liquidez (decimal) para um prazo, interpolando a curva de prêmios em bps."""
    terms = [c["term"] for c in curve]
    bps = [c["bps"] for c in curve]
    return float(np.interp(term, terms, bps)) / 10_000


def ftp(products: list[dict], base_rate: float, curve: list[dict]) -> list[dict]:
    """Taxa de transferência por produto e a margem que fica com a área de negócio."""
    out = []
    for prod in products:
        rate = base_rate + liquidity_premium(prod["term"], curve)
        if prod["side"] == "asset":
            margin = prod["client_rate"] - rate      # o crédito paga o funding à tesouraria
        else:
            margin = rate - prod["client_rate"]      # a captação é remunerada pela tesouraria
        out.append({**prod, "ftp_rate": rate, "liquidity_premium": rate - base_rate,
                    "margin": margin, "annual_margin": margin * prod["amount"]})
    return out


def run(p: dict) -> dict:
    base = liquidity_gap(p["items"], p["buffer"], p["buffer_haircut"], stressed=False)
    stress = liquidity_gap(p["items"], p["buffer"], p["buffer_haircut"], stressed=True)
    products = ftp(p["products"], p["base_rate"], p["premium_curve"])
    assets = [x for x in products if x["side"] == "asset"]
    liabilities = [x for x in products if x["side"] == "liability"]
    return {
        "buckets": BUCKETS,
        "gap": [{
            "bucket": b, "inflow_base": float(base["inflows"][i]), "outflow_base": float(base["outflows"][i]),
            "cum_base": float(base["cumulative"][i]), "inflow_stress": float(stress["inflows"][i]),
            "outflow_stress": float(stress["outflows"][i]), "cum_stress": float(stress["cumulative"][i]),
        } for i, b in enumerate(BUCKETS)],
        "survival_base": survival_horizon(base["cumulative"], base["start"]),
        "survival_stress": survival_horizon(stress["cumulative"], stress["start"]),
        "products": products,
        "business_margin": sum(x["annual_margin"] for x in products),
        # resultado da tesouraria: cobra FTP dos ativos e paga FTP aos passivos
        "treasury_margin": sum(x["ftp_rate"] * x["amount"] for x in assets) - sum(x["ftp_rate"] * x["amount"] for x in liabilities),
        "premium_curve": [{"term": t, "bps": liquidity_premium(t, p["premium_curve"]) * 10_000}
                          for t in np.linspace(0.0, max(c["term"] for c in p["premium_curve"]), 41)],
    }
