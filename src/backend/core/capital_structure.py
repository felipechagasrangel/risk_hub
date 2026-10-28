"""Composição do Patrimônio de Referência (PR) e Razão de Alavancagem (RA).

PR = Capital Principal (CET1) + Capital Complementar (AT1) + Nível II.
O CET1 parte do patrimônio líquido e sofre ajustes prudenciais: alguns itens são deduzidos por
inteiro; outros (créditos tributários de diferenças temporárias e participações relevantes em
instituições não consolidadas) só no que excede 10% do CET1 cada um e 15% no conjunto — o que
fica abaixo desses limites é ponderado a 250% no RWA.

RA = Nível I / exposição total, sem ponderação de risco.

Simplificações: o limite agregado de 15% é aplicado sobre a mesma base do limite individual;
sem participações de não controladores e sem os detalhes de elegibilidade dos instrumentos.
"""

INDIVIDUAL_LIMIT = 0.10
AGGREGATE_LIMIT = 0.15
THRESHOLD_RISK_WEIGHT = 2.5
LEVERAGE_MINIMUM = 0.03
ALPHA = 1.4


def cet1_build(p: dict) -> dict:
    """Do patrimônio líquido ao Capital Principal, passo a passo."""
    gross = p["share_capital"] + p["reserves"] + p["retained_earnings"] + p["oci"] - p["treasury_shares"]
    full = {k: p[k] for k in ("goodwill", "intangibles", "dta_tax_losses", "pension_assets", "other_deductions")}
    base = gross - sum(full.values())

    # deduções por limite: só o que passa de 10% da base, item a item
    limit = INDIVIDUAL_LIMIT * base
    excess_dta = max(p["dta_temporary"] - limit, 0.0)
    excess_inv = max(p["significant_investments"] - limit, 0.0)
    remaining = p["dta_temporary"] - excess_dta + p["significant_investments"] - excess_inv
    excess_aggregate = max(remaining - AGGREGATE_LIMIT * base, 0.0)
    cet1 = base - excess_dta - excess_inv - excess_aggregate
    weighted_250 = remaining - excess_aggregate

    steps = [{"label": "Patrimônio líquido elegível", "value": gross}]
    labels = {"goodwill": "Ágio", "intangibles": "Intangíveis", "dta_tax_losses": "Créditos tributários de prejuízo fiscal",
              "pension_assets": "Ativos atuariais de fundos de pensão", "other_deductions": "Outras deduções"}
    steps += [{"label": labels[k], "value": -v} for k, v in full.items() if v]
    if excess_dta:
        steps.append({"label": "Créditos tributários temporários acima de 10%", "value": -excess_dta})
    if excess_inv:
        steps.append({"label": "Participações relevantes acima de 10%", "value": -excess_inv})
    if excess_aggregate:
        steps.append({"label": "Excesso sobre o limite agregado de 15%", "value": -excess_aggregate})
    return {"gross": gross, "cet1": cet1, "steps": steps, "weighted_250": weighted_250,
            "deducted": gross - cet1}


def leverage_exposure(p: dict, deducted_assets: float) -> dict:
    """Exposição total da RA: balanço (sem os ativos deduzidos do capital) + derivativos + compromissadas
    + itens fora do balanço convertidos pelos CCFs."""
    on_balance = p["total_assets"] - deducted_assets
    derivatives = ALPHA * (p["derivatives_rc"] + p["derivatives_pfe"])
    off_balance = sum(i["amount"] * i["ccf"] for i in p["off_balance"])
    total = on_balance + derivatives + p["sft"] + off_balance
    return {"on_balance": on_balance, "derivatives": derivatives, "sft": p["sft"],
            "off_balance": off_balance, "total": total}


def run(p: dict) -> dict:
    cet1 = cet1_build(p)
    tier1 = cet1["cet1"] + p["at1"]
    total_capital = tier1 + p["tier2"]
    rwa = p["rwa_before_thresholds"] + THRESHOLD_RISK_WEIGHT * cet1["weighted_250"]
    exposure = leverage_exposure(p, cet1["deducted"])
    return {
        "cet1": cet1,
        "tier1": tier1,
        "total_capital": total_capital,
        "rwa": rwa,
        "ratios": {"cet1": cet1["cet1"] / rwa, "tier1": tier1 / rwa, "total": total_capital / rwa},
        "leverage": {**exposure, "ratio": tier1 / exposure["total"], "minimum": LEVERAGE_MINIMUM},
    }
