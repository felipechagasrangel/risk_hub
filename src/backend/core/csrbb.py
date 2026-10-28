"""CSRBB: risco de spread de crédito na carteira bancária.

Títulos privados da carteira bancária (debêntures, letras financeiras, bonds) valem pela taxa
livre de risco MAIS o spread do emissor. Basileia pede que o banco monitore esse risco junto com o
IRRBB: o spread pode abrir mesmo com os juros parados, e um swap de juros não o protege.

- Preço com cupom anual e rendimento composto anual (y = taxa livre + spread).
- Choques de spread por rating (ilustrativos) multiplicados por uma severidade.
- Títulos a valor justo em outros resultados abrangentes (VJORA) mudam o patrimônio pelo ORA na
  hora; os ao custo amortizado só aparecem no valor econômico (EVE).
- Hedge com swap (asset swap) neutraliza a parte de juros, mas não a de spread.
"""

DEFAULT_SPREAD_SHOCKS = {"AAA": 50, "AA": 80, "A": 120, "BBB": 200, "BB": 350}


def bond_price(coupon: float, maturity: float, y: float) -> float:
    """Preço por 1 de face de um título com cupom anual (última parcela fracionária pro rata)."""
    times = [float(k) for k in range(1, int(maturity) + 1)]
    if not times or times[-1] < maturity - 1e-9:
        times.append(maturity)
    pv, prev = 0.0, 0.0
    for t in times:
        pv += coupon * (t - prev) / (1 + y) ** t
        prev = t
    return pv + 1 / (1 + y) ** maturity


def spread_duration(coupon: float, maturity: float, y: float, h: float = 1e-4) -> float:
    """Variação percentual do preço por unidade de spread (diferença central)."""
    p = bond_price(coupon, maturity, y)
    return -(bond_price(coupon, maturity, y + h) - bond_price(coupon, maturity, y - h)) / (2 * h * p)


def run(p: dict) -> dict:
    rf, severity = p["risk_free"], p["severity"]
    d_rate = p["rate_shock_bps"] / 10_000
    rows = []
    for b in p["bonds"]:
        y = rf + b["spread"]
        d_spread = p["spread_shocks"][b["rating"]] * severity / 10_000
        price = bond_price(b["coupon"], b["maturity"], y)
        value = b["notional"] * price
        dv_spread = b["notional"] * (bond_price(b["coupon"], b["maturity"], y + d_spread) - price)
        dv_rate = b["notional"] * (bond_price(b["coupon"], b["maturity"], y + d_rate) - price)
        dv_both = b["notional"] * (bond_price(b["coupon"], b["maturity"], y + d_rate + d_spread) - price)
        hedged_both = dv_both - dv_rate if b["swapped"] else dv_both  # swap devolve a parte de juros
        rows.append({
            "name": b["name"], "rating": b["rating"], "accounting": b["accounting"], "swapped": b["swapped"],
            "value": value, "price": price, "spread_duration": spread_duration(b["coupon"], b["maturity"], y),
            "spread_shock_bps": d_spread * 10_000,
            "dv_spread": dv_spread, "dv_rate": dv_rate, "dv_both": dv_both, "dv_hedged": hedged_both,
            "cs01": -b["notional"] * price * spread_duration(b["coupon"], b["maturity"], y) / 10_000,
        })
    total = lambda k, pred=lambda r: True: sum(r[k] for r in rows if pred(r))
    vjora = lambda r: r["accounting"] == "vjora"
    by_rating = {}
    for r in rows:
        by_rating[r["rating"]] = by_rating.get(r["rating"], 0.0) + r["dv_spread"]
    return {
        "bonds": rows,
        "totals": {
            "value": total("value"), "cs01": total("cs01"),
            "eve_spread": total("dv_spread"), "eve_rate": total("dv_rate"), "eve_both": total("dv_both"),
            "eve_hedged": total("dv_hedged"),
            "oci_spread": total("dv_spread", vjora), "oci_hedged": total("dv_hedged", vjora),
        },
        "by_rating": [{"rating": k, "dv_spread": v} for k, v in by_rating.items()],
        "pct_tier1": {"eve_hedged": total("dv_hedged") / p["tier1"], "oci_hedged": total("dv_hedged", vjora) / p["tier1"]},
    }
