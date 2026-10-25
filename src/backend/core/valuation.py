"""Apreçamento: curva (accrual / custo amortizado) vs. marcação a mercado (MTM).

Título prefixado sem cupom (como uma LTN), com taxas em convenção exponencial base 252.
A taxa de mercado é igual à de compra até `shock_years` e passa a `market_rate` depois.
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
