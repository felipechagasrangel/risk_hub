"""Monitoramento de liquidez: concentração de funding, plano de contingência e liquidez intradiária.

- Concentração: participação dos maiores credores, índice de Herfindahl-Hirschman (HHI) por
  credor e por produto, e o quanto do colchão sobra se os k maiores credores saírem.
- Plano de contingência: indicadores de alerta antecipado (EWI) com limites de alerta e de
  contingência; o pior status define o nível de acionamento do plano.
- Intradiária (BCBS 248): a conta de reservas ao longo do dia. A métrica central é o maior uso
  de liquidez intradiária — a posição líquida acumulada mais negativa — comparada com a
  liquidez disponível (saldo de abertura + crédito intradia do BCB contra colateral).
"""

import numpy as np

SLOTS = [f"{h:02d}h" for h in range(8, 18)]


def concentration(sources: list[dict], buffer: float) -> dict:
    total = sum(s["amount"] for s in sources)
    ranked = sorted(sources, key=lambda s: -s["amount"])
    shares = [s["amount"] / total for s in ranked]
    by_product: dict[str, float] = {}
    for s in sources:
        by_product[s["product"]] = by_product.get(s["product"], 0.0) + s["amount"]
    hhi_product = sum((v / total) ** 2 for v in by_product.values())
    short_term = sum(s["amount"] for s in sources if s["days"] <= 30)
    loss_of_top = []
    cum = 0.0
    for k, s in enumerate(ranked[:10], start=1):
        cum += s["amount"]
        loss_of_top.append({"k": k, "name": s["name"], "outflow": cum, "buffer_left": buffer - cum,
                            "coverage": buffer / cum})
    return {
        "total": total,
        "ranked": [{**s, "share": sh} for s, sh in zip(ranked, shares)],
        "top1_share": shares[0] if shares else 0.0,
        "top10_share": sum(shares[:10]),
        "hhi_counterparty": sum(sh ** 2 for sh in shares),
        "hhi_product": hhi_product,
        "by_product": [{"product": k, "amount": v, "share": v / total} for k, v in sorted(by_product.items(), key=lambda kv: -kv[1])],
        "short_term_share": short_term / total,
        "loss_of_top": loss_of_top,
    }


def ewi_status(value: float, amber: float, red: float, higher_is_worse: bool) -> str:
    """Verde, amarela ou vermelha conforme os limites do indicador."""
    worse = (lambda a, b: a >= b) if higher_is_worse else (lambda a, b: a <= b)
    if worse(value, red):
        return "vermelha"
    if worse(value, amber):
        return "amarela"
    return "verde"


PLAN_LEVELS = {"verde": "normal", "amarela": "alerta", "vermelha": "contingência"}


def contingency(indicators: list[dict], computed: dict) -> dict:
    rows = []
    for ind in indicators:
        value = computed[ind["metric"]] if ind.get("metric") else ind["value"]
        rows.append({**ind, "value": value,
                     "status": ewi_status(value, ind["amber"], ind["red"], ind["higher_is_worse"])})
    order = ["verde", "amarela", "vermelha"]
    worst = max((r["status"] for r in rows), key=order.index, default="verde")
    return {"indicators": rows, "status": worst, "level": PLAN_LEVELS[worst],
            "counts": {s: sum(r["status"] == s for r in rows) for s in order}}


def funding_run(p: dict) -> dict:
    c = concentration(p["sources"], p["buffer"])
    computed = {"top10_share": c["top10_share"], "top1_share": c["top1_share"],
                "hhi_counterparty": c["hhi_counterparty"], "short_term_share": c["short_term_share"],
                "coverage_top3": c["loss_of_top"][min(2, len(c["loss_of_top"]) - 1)]["coverage"]}
    return {"concentration": c, "contingency": contingency(p["indicators"], computed)}


def intraday_path(flows: list[dict], opening: float, delay_slots: int = 0, inflow_failure: float = 0.0,
                  queue_noncritical: bool = False) -> dict:
    """Saldo da conta de reservas por horário.

    Estresse: as entradas atrasam `delay_slots` horários e uma fração `inflow_failure` não chega
    no dia. Com `queue_noncritical`, os pagamentos não críticos vão para o fim do dia.
    """
    n = len(SLOTS)
    inflow, outflow = np.zeros(n), np.zeros(n)
    for f in flows:
        a = np.array(f["amounts"], dtype=float)
        if f["kind"] == "in":
            a = a * (1 - inflow_failure)
            if delay_slots:
                shifted = np.zeros(n)
                for i, v in enumerate(a):
                    shifted[min(i + delay_slots, n - 1)] += v
                a = shifted
            inflow += a
        elif queue_noncritical and not f["time_critical"]:
            outflow[-1] += a.sum()
        else:
            outflow += a
    net = np.cumsum(inflow - outflow)
    balance = opening + net
    return {"inflow": inflow.tolist(), "outflow": outflow.tolist(), "net_cum": net.tolist(),
            "balance": balance.tolist(), "max_usage": float(max(-net.min(), 0.0)),
            "min_balance": float(balance.min()), "min_slot": SLOTS[int(balance.argmin())]}


def intraday(p: dict) -> dict:
    credit = p["collateral"] * (1 - p["haircut"])
    available = p["opening"] + credit
    base = intraday_path(p["flows"], p["opening"])
    stress = intraday_path(p["flows"], p["opening"], p["delay_slots"], p["inflow_failure"], p["queue_noncritical"])
    for r in (base, stress):
        r["credit_used"] = max(-r["min_balance"], 0.0)
        r["shortfall"] = max(r["credit_used"] - credit, 0.0)
        r["usage_over_available"] = r["max_usage"] / available if available else None
    return {"slots": SLOTS, "credit_capacity": credit, "available": available, "base": base, "stress": stress,
            "total_out": float(sum(sum(f["amounts"]) for f in p["flows"] if f["kind"] == "out"))}
