"""Apreçamento: curva (accrual / custo amortizado) vs. marcação a mercado (MTM).

Três instrumentos, todos com taxas em convenção exponencial base 252:
- título prefixado sem cupom (como uma LTN);
- título pós-fixado em CDI + spread (como um CDB ou uma LF);
- swap DI × pré.

Para o CDI futuro usamos a premissa de que a curva de DI futuro é a expectativa do CDI. Com isso,
projetar o CDI e descontar pela mesma curva se cancelam: a parte em CDI vale o mesmo na curva e a
mercado, e a marcação vem só do que é fixo (taxa pré ou spread).
"""


def pu(face: float, rate: float, years: float) -> float:
    return face / (1 + rate) ** years


def bond_paths(face: float, maturity_years: float, purchase_rate: float, market_rate: float,
               shock_years: float, today_years: float, steps: int = 60) -> dict:
    price_paid = pu(face, purchase_rate, maturity_years)

    def accrual(t: float) -> float:
        # Custo amortizado: o preço pago cresce à taxa efetiva da compra
        return price_paid * (1 + purchase_rate) ** t

    def mtm(t: float) -> float:
        rate = purchase_rate if t < shock_years else market_rate
        return pu(face, rate, maturity_years - t)

    times = sorted({maturity_years * i / steps for i in range(steps + 1)} | {shock_years, today_years})
    path = [{"t": t, "accrual": accrual(t), "mtm": mtm(t)} for t in times if t <= maturity_years]

    a, m = accrual(today_years), mtm(today_years)
    interest = a - price_paid
    return {
        "price_paid": price_paid,
        "path": path,
        "today": {
            "t": today_years, "accrual": a, "mtm": m, "unrealized": m - a,
            # Como cada categoria da Resolução CMN nº 4.966 reconhece o mesmo título
            "categories": {
                "amortized_cost": {"carrying": a, "income": interest, "oci": 0.0},
                "fvoci": {"carrying": m, "income": interest, "oci": m - a},
                "fvtpl": {"carrying": m, "income": m - price_paid, "oci": 0.0},
            },
        },
    }


def factor(rate: float, business_days: float) -> float:
    return (1 + rate) ** (business_days / 252)


def floating_note(notional: float, total_du: int, elapsed_du: int, cdi_realized: float,
                  spread_contract: float, spread_market: float) -> dict:
    """Pós-fixado CDI + spread: a marcação vem só da mudança do spread de mercado."""
    remaining = total_du - elapsed_du
    cdi_factor = factor(cdi_realized, elapsed_du)
    curve = notional * cdi_factor * factor(spread_contract, elapsed_du)

    def mtm(spread: float) -> float:
        # Fluxo final = N × CDI acumulado × (1 + s0)^(T/252); o CDI futuro se cancela com o desconto
        return curve * factor(spread_contract, remaining) / factor(spread, remaining)

    grid = [spread_contract + x / 10000 for x in range(-200, 201, 25)]
    return {
        "cdi_factor": cdi_factor,
        "curve": curve,
        "mtm": mtm(spread_market),
        "unrealized": mtm(spread_market) - curve,
        "profile": [{"spread": s, "mtm": mtm(s), "curve": curve} for s in grid],
    }


def swap_di_pre(notional: float, total_du: int, elapsed_du: int, fixed_rate: float,
                cdi_realized: float, market_rate: float, receive_fixed: bool) -> dict:
    """Swap DI × pré com troca de fluxos só no vencimento (padrão dos swaps registrados na B3).

    Na curva, cada ponta é corrigida pela sua taxa contratada até hoje: é o valor que se
    liquidaria se o contrato fosse encerrado hoje pelas taxas do contrato. A mercado, a ponta pré
    é o fluxo final trazido a valor presente pela taxa pré de mercado para o prazo restante.
    """
    remaining = total_du - elapsed_du
    sign = 1 if receive_fixed else -1
    cdi_leg = notional * factor(cdi_realized, elapsed_du)  # vale o mesmo na curva e a mercado
    fixed_curve = notional * factor(fixed_rate, elapsed_du)

    def fixed_mtm(rate: float) -> float:
        return notional * factor(fixed_rate, total_du) / factor(rate, remaining)

    legs = {
        "fixed": {"curve": fixed_curve, "mtm": fixed_mtm(market_rate)},
        "cdi": {"curve": cdi_leg, "mtm": cdi_leg},
    }
    value_curve = sign * (fixed_curve - cdi_leg)
    value_mtm = sign * (fixed_mtm(market_rate) - cdi_leg)
    grid = [fixed_rate + x / 10000 for x in range(-400, 401, 25)]
    return {
        "legs": legs,
        "receive_fixed": receive_fixed,
        "value_curve": value_curve,
        "value_mtm": value_mtm,
        "unrealized": value_mtm - value_curve,
        "dv01": sign * (fixed_mtm(market_rate + 0.0001) - fixed_mtm(market_rate)),
        "profile": [{"rate": r, "mtm": sign * (fixed_mtm(r) - cdi_leg), "curve": value_curve} for r in grid],
    }
