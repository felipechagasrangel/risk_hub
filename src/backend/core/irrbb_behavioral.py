"""IRRBB comportamental: depósitos sem vencimento (NMD) e pré-pagamento de crédito.

Os prazos contratuais enganam: um depósito à vista pode sair amanhã, mas uma parte estável fica
por anos; um crédito de 5 anos pode ser quitado antes, e mais ainda quando os juros caem.

- NMD (BCBS d368): o saldo se divide em núcleo estável e parte volátil. O núcleo é distribuído
  no tempo com prazo médio limitado por segmento; a parte volátil vence no dia seguinte.
- Pré-pagamento: taxa anual constante (CPR) ou crescente quando a taxa de mercado cai abaixo da
  taxa do contrato (incentivo de refinanciamento), o que cria convexidade negativa.

Fluxos mensais; desconto pela curva pré flat (base 252) com choque paralelo.
"""

import numpy as np

# Limites do BCBS d368 para a parte estável e o prazo médio do núcleo, por segmento
NMD_CAPS = {
    "retail_transactional": {"core_share": 0.90, "avg_maturity": 5.0},
    "retail_non_transactional": {"core_share": 0.70, "avg_maturity": 4.5},
    "wholesale": {"core_share": 0.50, "avg_maturity": 4.0},
}


def nmd_cash_flows(balance: float, segment: str, stable_share: float, core_share: float,
                   avg_maturity: float) -> tuple[np.ndarray, dict]:
    """Saídas mensais do depósito: parte volátil no 1º mês, núcleo com amortização linear.

    Amortização linear em T anos tem prazo médio T/2, então T = 2 × prazo médio.
    Os parâmetros informados são limitados pelos tetos do segmento.
    """
    caps = NMD_CAPS[segment]
    core = min(stable_share * core_share, caps["core_share"])
    maturity = min(avg_maturity, caps["avg_maturity"])
    months = max(1, int(round(2 * maturity * 12)))
    flows = np.zeros(months)
    flows[0] += balance * (1 - core)
    flows += balance * core / months
    return flows, {"core_share": core, "avg_maturity": maturity, "months": months}


def smm(cpr: float) -> float:
    """Taxa mensal de pré-pagamento (single monthly mortality) a partir da anual (CPR)."""
    return 1 - (1 - cpr) ** (1 / 12)


def prepayment_rate(base_cpr: float, sensitivity: float, contract_rate: float, market_rate: float) -> float:
    """CPR com incentivo: sobe `sensitivity` pontos por ponto de queda da taxa de mercado abaixo da do contrato."""
    incentive = max(contract_rate - market_rate, 0.0) * 100
    return float(np.clip(base_cpr + sensitivity * incentive, 0.0, 0.6))


def loan_cash_flows(balance: float, annual_rate: float, months: int, cpr: float) -> np.ndarray:
    """Fluxos mensais de um crédito Price com pré-pagamento: parcela + valor antecipado."""
    i = (1 + annual_rate) ** (1 / 12) - 1
    m = smm(cpr)
    flows, b = np.zeros(months), balance
    for k in range(months):
        remaining = months - k
        payment = b * i / (1 - (1 + i) ** -remaining)
        interest = b * i
        b_after = b - (payment - interest)
        prepaid = b_after * m
        flows[k] = payment + prepaid
        b = b_after - prepaid
    return flows


def bullet_cash_flows(balance: float, annual_rate: float, months: int) -> np.ndarray:
    flows = np.zeros(months)
    flows[-1] = balance * (1 + annual_rate) ** (months / 12)
    return flows


def present_value(flows: np.ndarray, rate: float) -> float:
    t = np.arange(1, len(flows) + 1) / 12
    return float(np.sum(flows / (1 + rate) ** t))


def macaulay_duration(flows: np.ndarray, rate: float) -> float:
    t = np.arange(1, len(flows) + 1) / 12
    pv = flows / (1 + rate) ** t
    return float(np.sum(t * pv) / np.sum(pv))


def balance_sheet_eve(p: dict, shock: float, assumption: str) -> dict:
    """EVE do balanço exemplo sob uma premissa: 'contratual', 'estática' ou 'dinâmica'."""
    market = p["market_rate"] + shock
    if assumption == "contratual":
        cpr = 0.0
    elif assumption == "estática":
        cpr = p["base_cpr"]
    else:
        cpr = prepayment_rate(p["base_cpr"], p["cpr_sensitivity"], p["loan_rate"], market)
    loans = loan_cash_flows(p["loan_balance"], p["loan_rate"], p["loan_months"], cpr)

    # Depósitos sem remuneração: só o principal sai, conforme a premissa de prazo
    if assumption == "contratual":
        deposits = np.array([p["nmd_balance"]])  # tudo vence no primeiro mês
    else:
        deposits, _ = nmd_cash_flows(p["nmd_balance"], p["nmd_segment"], p["stable_share"],
                                     p["core_share"], p["nmd_avg_maturity"])
    cdb =bullet_cash_flows(p["cdb_balance"], p["cdb_rate"], p["cdb_months"])

    pv_loans = present_value(loans, market)
    pv_deposits = present_value(deposits, market)
    pv_cdb = present_value(cdb, market)
    return {"pv_loans": pv_loans, "pv_deposits": pv_deposits, "pv_cdb": pv_cdb,
            "eve": pv_loans - pv_deposits - pv_cdb, "cpr": cpr}


def run(p: dict) -> dict:
    shocks = [s / 10_000 for s in range(-300, 301, 50)]
    assumptions = ("contratual", "estática", "dinâmica")
    base = {a: balance_sheet_eve(p, 0.0, a) for a in assumptions}
    profile = []
    for s in shocks:
        row = {"shock_bps": round(s * 10_000)}
        for a in assumptions:
            r = balance_sheet_eve(p, s, a)
            row[f"delta_{a}"] = r["eve"] - base[a]["eve"]
            row[f"loans_{a}"] = r["pv_loans"]
        profile.append(row)

    deposits, nmd_info = nmd_cash_flows(p["nmd_balance"], p["nmd_segment"], p["stable_share"],
                                        p["core_share"], p["nmd_avg_maturity"])
    by_year = [float(deposits[i:i + 12].sum()) for i in range(0, len(deposits), 12)]
    loans_static = loan_cash_flows(p["loan_balance"], p["loan_rate"], p["loan_months"], p["base_cpr"])
    loans_contract = loan_cash_flows(p["loan_balance"], p["loan_rate"], p["loan_months"], 0.0)
    return {
        "base": base,
        "profile": profile,
        "nmd": {**nmd_info, "by_year": by_year,
                "duration_behavioral": macaulay_duration(deposits, p["market_rate"]),
                "caps": NMD_CAPS[p["nmd_segment"]]},
        "loans": {
            "duration_contract": macaulay_duration(loans_contract, p["market_rate"]),
            "duration_static": macaulay_duration(loans_static, p["market_rate"]),
            "by_year_contract": [float(loans_contract[i:i + 12].sum()) for i in range(0, len(loans_contract), 12)],
            "by_year_static": [float(loans_static[i:i + 12].sum()) for i in range(0, len(loans_static), 12)],
        },
    }
