"""Risco de liquidez: LCR (30 dias de estresse) e NSFR (estrutura de funding de 1 ano)."""

HAIRCUTS = {"1": 0.0, "2A": 0.15, "2B": 0.50}
INFLOW_CAP = 0.75


def hqla_stock(items: list[dict]) -> dict:
    """Estoque de HQLA após haircuts e limites (2B ≤ 15% e Nível 2 total ≤ 40%)."""
    by_level = {lvl: 0.0 for lvl in HAIRCUTS}
    for it in items:
        by_level[it["level"]] += it["amount"] * (1 - HAIRCUTS[it["level"]])
    l1, l2a, l2b = by_level["1"], by_level["2A"], by_level["2B"]
    adj_15 = max(l2b - 15 / 85 * (l1 + l2a), l2b - 15 / 60 * l1, 0.0)
    adj_40 = max(l2a + l2b - adj_15 - 2 / 3 * l1, 0.0)
    return {
        "level1": l1, "level2a": l2a, "level2b": l2b,
        "cap_adjustment_2b": adj_15, "cap_adjustment_level2": adj_40,
        "total": l1 + l2a + l2b - adj_15 - adj_40,
    }


def lcr(hqla: list[dict], outflows: list[dict], inflows: list[dict]) -> dict:
    stock = hqla_stock(hqla)
    out_rows = [{**o, "weighted": o["amount"] * o["rate"]} for o in outflows]
    in_rows = [{**i, "weighted": i["amount"] * i["rate"]} for i in inflows]
    total_out = sum(r["weighted"] for r in out_rows)
    total_in = sum(r["weighted"] for r in in_rows)
    capped_in = min(total_in, INFLOW_CAP * total_out)
    net = total_out - capped_in
    return {
        "hqla": stock, "outflows": out_rows, "inflows": in_rows,
        "total_outflows": total_out, "total_inflows": total_in,
        "capped_inflows": capped_in, "net_outflows": net,
        "lcr": stock["total"] / net if net > 0 else None,
    }


def nsfr(asf: list[dict], rsf: list[dict]) -> dict:
    asf_rows = [{**a, "weighted": a["amount"] * a["factor"]} for a in asf]
    rsf_rows = [{**r, "weighted": r["amount"] * r["factor"]} for r in rsf]
    total_asf = sum(r["weighted"] for r in asf_rows)
    total_rsf = sum(r["weighted"] for r in rsf_rows)
    return {
        "asf": asf_rows, "rsf": rsf_rows,
        "total_asf": total_asf, "total_rsf": total_rsf,
        "nsfr": total_asf / total_rsf if total_rsf > 0 else None,
    }
