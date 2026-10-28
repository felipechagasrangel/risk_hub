"""Detalhes da métrica regulatória de ΔEVE: agregação entre moedas, piso pós-choque e margens.

- Agregação (Basel SRP31.129): em cada cenário, somam-se apenas as PERDAS de EVE de cada moeda —
  ganho numa moeda não compensa perda em outra. A medida é a maior perda agregada entre os seis
  cenários. Algumas jurisdições (EBA) aceitam compensar ganhos com peso de 50%.
- Piso (SRP31.93): o supervisor pode impor um piso às taxas pós-choque, nunca acima de zero.
  Exemplo da EBA: −100 bps no prazo zero, subindo 5 bps por ano até 0% em 20 anos.
- Margens comerciais (SRP31.100): o banco escolhe se tira a margem dos fluxos. Se a mantém, pode
  descontar a taxa livre de risco mais a margem; se a tira, desconta pela livre de risco.
"""

from math import exp

from backend.core import irrbb

SCENARIO_LABELS = {
    "parallel_up": "Paralelo para cima", "parallel_down": "Paralelo para baixo",
    "steepener": "Inclinação", "flattener": "Achatamento",
    "short_up": "Curtos para cima", "short_down": "Curtos para baixo",
}


def rate_floor(t: float, kind: str) -> float | None:
    if kind == "zero":
        return 0.0
    if kind == "eba":
        return min(-0.01 + 0.0005 * t, 0.0)
    return None


def post_shock_rate(base: float, shock: float, t: float, floor_kind: str) -> float:
    """Taxa pós-choque com piso; se a taxa base já está abaixo do piso, o piso passa a ser ela."""
    r = base + shock
    floor = rate_floor(t, floor_kind)
    return r if floor is None else max(r, min(base, floor))


def position_pv(p: dict, curve: list[dict], scenario: str, shocks: dict, floor_kind: str, margins: str) -> float:
    """PV de um bullet. margins: 'include_rf' (fluxo com margem, desconto livre de risco),
    'include_spread' (fluxo com margem, desconto livre de risco + margem) ou 'exclude'."""
    coupon = p["rate"] - (p["margin"] if margins == "exclude" else 0.0)
    flows = irrbb.cash_flows({**p, "rate": coupon})
    pv = 0.0
    for t, cf in flows:
        base = irrbb.interpolate(curve, t)
        s = irrbb.shock(scenario, t, **shocks) if scenario != "base" else 0.0
        r = post_shock_rate(base, s, t, floor_kind)
        if margins == "include_spread":
            r += p["margin"]
        pv += cf * exp(-r * t)
    return pv


def currency_eve(positions: list[dict], curve: list[dict], scenario: str, shocks: dict,
                 floor_kind: str, margins: str) -> float:
    sign = lambda p: 1 if p["side"] == "asset" else -1
    return sum(sign(p) * position_pv(p, curve, scenario, shocks, floor_kind, margins) for p in positions)


def analyze(p: dict) -> dict:
    currencies = p["currencies"]
    rows = []
    for sc in irrbb.SCENARIOS:
        per_ccy = {}
        for c in currencies:
            pos = [x for x in p["positions"] if x["currency"] == c["code"]]
            base = currency_eve(pos, c["curve"], "base", c["shocks"], p["floor"], p["margins"])
            shocked = currency_eve(pos, c["curve"], sc, c["shocks"], p["floor"], p["margins"])
            per_ccy[c["code"]] = (shocked - base) * c["fx"]  # em reais
        losses = sum(max(-d, 0.0) for d in per_ccy.values())
        gains = sum(max(d, 0.0) for d in per_ccy.values())
        rows.append({"scenario": sc, "label": SCENARIO_LABELS[sc], "by_currency": per_ccy,
                     "net": -sum(per_ccy.values()),          # perda líquida, compensando moedas
                     "basel": losses,                       # só perdas, sem compensação
                     "eba": max(losses - 0.5 * gains, 0.0)})  # ganhos com peso de 50%
    worst = {k: max(rows, key=lambda r: r[k]) for k in ("net", "basel", "eba")}
    measure = {k: {"value": max(worst[k][k], 0.0), "scenario": worst[k]["scenario"]} for k in worst}
    tier1 = p["tier1"]
    # Curvas pós-choque do paralelo para baixo, com e sem piso, para o gráfico
    grid = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30]
    floor_curves = {
        c["code"]: [{"tenor": t, "base": irrbb.interpolate(c["curve"], t),
                     "shocked": irrbb.interpolate(c["curve"], t) + irrbb.shock("parallel_down", t, **c["shocks"]),
                     "floored": post_shock_rate(irrbb.interpolate(c["curve"], t),
                                                irrbb.shock("parallel_down", t, **c["shocks"]), t, p["floor"]),
                     "floor": rate_floor(t, p["floor"])}
                    for t in grid]
        for c in currencies
    }
    return {"scenarios": rows, "measure": measure, "tier1": tier1,
            "outlier": {k: v["value"] / tier1 if tier1 else None for k, v in measure.items()},
            "floor_curves": floor_curves}


def margins_comparison(p: dict) -> list[dict]:
    """A mesma carteira nas três escolhas de margem, mantendo o resto igual."""
    out = []
    for m in ("include_rf", "include_spread", "exclude"):
        r = analyze({**p, "margins": m})
        out.append({"margins": m, "basel": r["measure"]["basel"]["value"], "scenario": r["measure"]["basel"]["scenario"]})
    return out


def run(p: dict) -> dict:
    return {**analyze(p), "margins": margins_comparison(p)}
