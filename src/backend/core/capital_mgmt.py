"""Capital: risco operacional, adicionais (buffers), planejamento de capital e grandes exposições.

- Risco operacional (Res. BCB 356/2023): RWAOPAD = BIC × ILM / F. O Indicador de Negócios (BI)
  soma os componentes de juros (ILDC), serviços (SC) e financeiro (FC), em médias de três anos;
  o BIC aplica coeficientes marginais de 12%, 15% e 18%; o ILM ajusta pelas perdas históricas.
- Adicionais de Capital Principal (Res. CMN 4.958/2021): conservação, contracíclico e sistêmico.
  Quem fica dentro da faixa dos adicionais tem a distribuição de resultados limitada por quartil.
- Planejamento de capital: projeção trimestral do índice em cenário base e de estresse, com a
  distribuição de resultados limitada automaticamente pelos adicionais.
- Grandes exposições (Res. CMN 4.677/2018): limite de 25% do Nível I por cliente ou grupo
  econômico; exposições de 10% ou mais são concentradas e somadas não passam de 600%.

Valores em R$ milhões.
"""

from math import e, log

F = 0.08  # fator F da Res. CMN 4.958: RWA = capital requerido / 8%
BIC_BRACKETS = [(5_000, 0.12), (150_000, 0.15), (float("inf"), 0.18)]  # limites do BI em R$ milhões
LOSS_MULTIPLIER = 6  # LC = 6 × média anual das perdas de 10 anos (art. 11)

MINIMUMS = {"cet1": 0.045, "tier1": 0.06, "total": 0.08}
# Faixas da distribuição: fração do ACP atendida → fração máxima do lucro que pode ser distribuída
MDA_BANDS = [(0.25, 0.0), (0.50, 0.20), (0.75, 0.40), (1.00, 0.60)]


def _avg(xs: list[float]) -> float:
    return sum(xs) / len(xs)


def business_indicator(years: list[dict]) -> dict:
    """Componentes do BI (arts. 5º a 8º) a partir de três períodos anuais."""
    get = lambda k: [y[k] for y in years]
    ildc = min(_avg([abs(y["ii"] - y["ie"]) for y in years]), 0.0225 * _avg(get("iea"))) + _avg(get("di"))
    sc = (max(_avg(get("fi")), _avg([abs(v) for v in get("fe")]))
          + max(_avg(get("ooi")), _avg([abs(v) for v in get("ooe")])))
    fc = _avg([abs(v) for v in get("ntb")]) + _avg([abs(v) for v in get("nbb")])
    return {"ildc": ildc, "sc": sc, "fc": fc, "bi": ildc + sc + fc}


def bic(bi: float) -> dict:
    """Indicador de Negócios Ponderado: coeficientes marginais por faixa do BI (art. 4º)."""
    total, lower, parts = 0.0, 0.0, []
    for upper, coef in BIC_BRACKETS:
        slice_ = max(min(bi, upper) - lower, 0.0)
        parts.append({"upper": upper if upper != float("inf") else None, "coef": coef, "amount": slice_, "bic": coef * slice_})
        total += coef * slice_
        lower = upper
    return {"bic": total, "parts": parts}


def ilm(loss_component: float, bic_value: float) -> float:
    """Multiplicador de Perdas Internas (art. 10): 1 quando as perdas são proporcionais ao BIC."""
    return log(e - 1 + (loss_component / bic_value) ** 0.8)


def op_risk(p: dict) -> dict:
    bi = business_indicator(p["years"])
    b = bic(bi["bi"])
    lc = LOSS_MULTIPLIER * _avg(p["losses"])
    computed_ilm = ilm(lc, b["bic"]) if b["bic"] > 0 else 1.0
    # S1 e S2 calculam o ILM; S3 usa 1 (ou o calculado, com autorização); S4 usa 1
    used_ilm = computed_ilm if p["segment"] == "S1S2" or p.get("s3_uses_ilm") and p["segment"] == "S3" else 1.0
    rwa = b["bic"] * used_ilm / F
    ratios = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
    return {
        **bi, **b, "lc": lc, "ilm_computed": computed_ilm, "ilm": used_ilm,
        "capital": b["bic"] * used_ilm, "rwa": rwa,
        "ilm_curve": [{"ratio": r, "ilm": ilm(r, 1.0)} for r in ratios],
    }


def buffer_requirement(countercyclical: float, systemic: float, conservation: float = 0.025) -> dict:
    total = conservation + countercyclical + systemic
    return {"conservation": conservation, "countercyclical": countercyclical, "systemic": systemic, "total": total}


def distribution_limit(cet1: float, at1: float, tier2: float, rwa: float, acp: float) -> dict:
    """Quanto do ACP está atendido e a fração máxima do lucro que pode ser distribuída.

    O Capital Principal usado para cobrir falta de Complementar ou de Nível II nos mínimos de
    Nível I e de PR não conta para o adicional.
    """
    r_cet1, r_at1, r_t2 = cet1 / rwa, at1 / rwa, tier2 / rwa
    used = (MINIMUMS["cet1"] + max(MINIMUMS["tier1"] - MINIMUMS["cet1"] - r_at1, 0.0)
            + max(MINIMUMS["total"] - MINIMUMS["tier1"] - r_t2, 0.0))
    available = r_cet1 - used
    filled = available / acp if acp > 0 else float("inf")
    max_payout = 1.0
    if available < 0:
        max_payout, band = 0.0, "abaixo do mínimo"
    else:
        band = "acima dos adicionais"
        for i, (upper, payout) in enumerate(MDA_BANDS):
            if filled < upper:
                max_payout, band = payout, f"{i + 1}º quartil do ACP"
                break
    return {"cet1_ratio": r_cet1, "used_for_minimums": used, "available": available,
            "filled": filled, "max_payout": max_payout, "band": band}


def buffers(p: dict) -> dict:
    acp = buffer_requirement(p["countercyclical"], p["systemic"])
    limit = distribution_limit(p["cet1"], p["at1"], p["tier2"], p["rwa"], acp["total"])
    # Para o gráfico: distribuição máxima em função do índice de Capital Principal
    sweep = []
    for bp in range(300, 1501, 25):
        x = bp / 10_000
        lim = distribution_limit(x * p["rwa"], p["at1"], p["tier2"], p["rwa"], acp["total"])
        sweep.append({"cet1_ratio": x, "max_payout": lim["max_payout"]})
    return {
        "acp": acp, "limit": limit,
        "ratios": {"cet1": p["cet1"] / p["rwa"], "tier1": (p["cet1"] + p["at1"]) / p["rwa"],
                   "total": (p["cet1"] + p["at1"] + p["tier2"]) / p["rwa"]},
        "stack": {"minimum": MINIMUMS["cet1"], "acp": acp["total"], "requirement": MINIMUMS["cet1"] + acp["total"]},
        "sweep": sweep,
        "distribution": limit["max_payout"] * p["net_income"],
    }


def project_capital(p: dict, scenario: dict, quarters: int = 12) -> list[dict]:
    """Projeção trimestral do capital: lucro, perdas de estresse, crescimento do RWA e distribuição.

    A distribuição desejada (payout) é limitada pela faixa dos adicionais em que o banco está no
    início de cada trimestre.
    """
    acp = buffer_requirement(p["countercyclical"], p["systemic"])["total"]
    cet1, rwa, rwa0 = p["cet1"], p["rwa"], p["rwa"]
    path = [{"quarter": 0, "cet1": cet1, "rwa": rwa, "cet1_ratio": cet1 / rwa, "profit": 0.0,
             "distributed": 0.0, "max_payout": 1.0}]
    for q in range(1, quarters + 1):
        year = (q - 1) // 4
        losses = scenario["losses"][min(year, len(scenario["losses"]) - 1)] * rwa0 / 4
        profit = scenario["roe"] * cet1 / 4 - losses
        lim = distribution_limit(cet1, p["at1"], p["tier2"], rwa, acp)
        payout = min(p["payout"], lim["max_payout"]) if profit > 0 else 0.0
        distributed = payout * profit
        cet1 += profit - distributed
        rwa *= (1 + scenario["rwa_growth"]) ** 0.25
        path.append({"quarter": q, "cet1": cet1, "rwa": rwa, "cet1_ratio": cet1 / rwa, "profit": profit,
                     "distributed": distributed, "max_payout": lim["max_payout"]})
    return path


def capital_plan(p: dict) -> dict:
    acp = buffer_requirement(p["countercyclical"], p["systemic"])["total"]
    target = MINIMUMS["cet1"] + acp + p["management_buffer"]
    out = {}
    for name in ("base", "stress"):
        path = project_capital(p, p[name])
        worst = min(path, key=lambda r: r["cet1_ratio"])
        need = max(max(target * r["rwa"] - r["cet1"] for r in path), 0.0)
        out[name] = {"path": path, "worst_ratio": worst["cet1_ratio"], "worst_quarter": worst["quarter"],
                     "capital_need": need, "distributed": sum(r["distributed"] for r in path)}
    return {**out, "stack": {"minimum": MINIMUMS["cet1"], "acp": acp,
                             "management_buffer": p["management_buffer"], "target": target}}


def large_exposures(exposures: list[dict], tier1: float, limit: float = 0.25,
                    threshold: float = 0.10, aggregate_limit: float = 6.0) -> dict:
    """Agrega por grupo econômico, abate mitigadores elegíveis e compara com o Nível I."""
    groups: dict[str, dict] = {}
    for x in exposures:
        g = groups.setdefault(x["group"] or x["name"], {"group": x["group"] or x["name"], "members": [],
                                                       "gross": 0.0, "mitigation": 0.0, "exempt": x["exempt"]})
        g["members"].append(x["name"])
        g["gross"] += x["gross"]
        g["mitigation"] += min(x["mitigation"], x["gross"])
        g["exempt"] = g["exempt"] and x["exempt"]
    rows = []
    for g in groups.values():
        net = g["gross"] - g["mitigation"]
        pct = net / tier1
        status = "isenta" if g["exempt"] else ("acima do limite" if pct > limit else
                                                 "concentrada" if pct >= threshold else "ok")
        rows.append({**g, "net": net, "pct_tier1": pct, "status": status})
    rows.sort(key=lambda r: -r["net"])
    concentrated = sum(r["net"] for r in rows if not r["exempt"] and r["pct_tier1"] >= threshold)
    return {"groups": rows, "tier1": tier1, "limit": limit, "threshold": threshold,
            "concentrated_total": concentrated, "concentrated_pct": concentrated / tier1,
            "aggregate_limit": aggregate_limit,
            "breaches": sum(r["status"] == "acima do limite" for r in rows)}
