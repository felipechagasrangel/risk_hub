"""Sensibilidades de operações aos fatores de risco do mercado brasileiro.

Fatores: curva pré (DI), cupom cambial, cupom de IPCA (juro real), dólar à vista e volatilidade.
As curvas são definidas por taxas em vértices (anos) com interpolação linear e extrapolação flat.

Convenções:
- pré e cupom de IPCA: exponencial base 252, (1 + r)^(DU/252);
- cupom cambial: linear base 360, 1 + c · DC/360 (com DC ≈ anos × 365).

Sensibilidades por bump-and-reprice: desloca-se um fator, reprecifica-se a operação e mede-se a
diferença. É o método mais geral — funciona para qualquer instrumento que se saiba precificar.
"""

from copy import deepcopy
from math import log, sqrt
from statistics import NormalDist

import numpy as np

VERTICES = np.array([0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0])
CURVES = ("pre", "cupom", "ipca")
BP = 0.0001
_N = NormalDist()


def rate(curve: np.ndarray, t: float) -> float:
    """Taxa da curva no prazo t (anos): interpolação linear entre vértices, flat fora deles."""
    return float(np.interp(t, VERTICES, curve))


def df_pre(market: dict, t: float) -> float:
    return (1 + rate(market["pre"], t)) ** -t


def df_ipca(market: dict, t: float) -> float:
    return (1 + rate(market["ipca"], t)) ** -t


def df_cupom(market: dict, t: float) -> float:
    return 1 / (1 + rate(market["cupom"], t) * t * 365 / 360)


def forward_fx(market: dict, t: float) -> float:
    """Dólar a termo: à vista corrigido pela pré e descontado pelo cupom cambial."""
    return market["spot"] * df_cupom(market, t) / df_pre(market, t)


def semiannual_dates(maturity: float) -> np.ndarray:
    n = max(1, int(round(maturity * 2)))
    return maturity - np.arange(n)[::-1] * 0.5


def price(instrument: dict, market: dict) -> float:
    """Valor em R$ de uma posição, segundo o tipo de instrumento."""
    kind, q, T = instrument["kind"], instrument["notional"], instrument["maturity"]
    if kind == "ltn":  # prefixado sem cupom, face R$ 1.000 por título
        return q * 1000 * df_pre(market, T)
    if kind == "ntnf":  # prefixado com cupom de 10% a.a. pago semestralmente
        c = 1000 * (1.10 ** 0.5 - 1)
        dates = semiannual_dates(T)
        return q * sum((c + (1000 if t == dates[-1] else 0)) * df_pre(market, t) for t in dates)
    if kind == "ntnb":  # IPCA + 6% a.a. semestral, sobre o VNA corrente
        vna, c = instrument.get("vna", 4500.0), 1.06 ** 0.5 - 1
        dates = semiannual_dates(T)
        return q * vna * sum((c + (1 if t == dates[-1] else 0)) * df_ipca(market, t) for t in dates)
    if kind == "swap_fx":  # recebe dólar + cupom, paga CDI; contratado hoje a mercado
        s0, c0 = instrument["spot0"], instrument["cupom0"]
        usd_leg = q / s0 * market["spot"] * (1 + c0 * T * 365 / 360) * df_cupom(market, T)
        return usd_leg - q  # ponta CDI na curva vale o nocional
    if kind == "ndf":  # comprado em dólar a termo, nocional em US$
        return q * (forward_fx(market, T) - instrument["strike"]) * df_pre(market, T)
    if kind == "call_fx":  # call de dólar europeia (Black sobre o termo), nocional em US$
        f, k, vol = forward_fx(market, T), instrument["strike"], market["vol"]
        d1 = (log(f / k) + 0.5 * vol**2 * T) / (vol * sqrt(T))
        d2 = d1 - vol * sqrt(T)
        return q * df_pre(market, T) * (f * _N.cdf(d1) - k * _N.cdf(d2))
    raise ValueError(f"Instrumento desconhecido: {kind}")


def portfolio_value(positions: list[dict], market: dict) -> float:
    return sum(price(p, market) for p in positions)


def bump_curve(market: dict, curve: str, shock: float, vertex: int | None = None) -> dict:
    """Desloca uma curva inteira (vertex=None) ou só um vértice."""
    bumped = deepcopy(market)
    if vertex is None:
        bumped[curve] = bumped[curve] + shock
    else:
        bumped[curve][vertex] += shock
    return bumped


def key_rate_dv01(positions: list[dict], market: dict) -> dict:
    """DV01 por vértice de cada curva: variação de valor para +1 bp em um vértice por vez."""
    base = portfolio_value(positions, market)
    return {curve: [portfolio_value(positions, bump_curve(market, curve, BP, k)) - base
                    for k in range(len(VERTICES))]
            for curve in CURVES}


def fx_and_vol_greeks(positions: list[dict], market: dict) -> dict:
    """Delta e gamma ao dólar (por 1% de variação) e vega (por 1 ponto de volatilidade)."""
    base = portfolio_value(positions, market)
    up = portfolio_value(positions, {**market, "spot": market["spot"] * 1.01})
    down = portfolio_value(positions, {**market, "spot": market["spot"] * 0.99})
    vol_up = portfolio_value(positions, {**market, "vol": market["vol"] + 0.01})
    vol_down = portfolio_value(positions, {**market, "vol": market["vol"] - 0.01})
    return {
        "delta_fx": (up - down) / 2,           # R$ por +1% no dólar
        "gamma_fx": up - 2 * base + down,      # variação do delta por 1%, em R$
        "vega": (vol_up - vol_down) / 2,       # R$ por +1 ponto de volatilidade
    }


def pnl_explain(positions: list[dict], market: dict, shocks: dict) -> dict:
    """Compara a reavaliação completa com a aproximação pelas sensibilidades (Taylor)."""
    base = portfolio_value(positions, market)
    shocked = deepcopy(market)
    for curve in CURVES:
        shocked[curve] = shocked[curve] + shocks[curve] * BP
    shocked["spot"] *= 1 + shocks["fx_pct"] / 100
    shocked["vol"] += shocks["vol_pts"] / 100
    full = portfolio_value(positions, shocked) - base

    dv01 = key_rate_dv01(positions, market)
    greeks = fx_and_vol_greeks(positions, market)
    parts = {curve: sum(dv01[curve]) * shocks[curve] for curve in CURVES}
    parts["delta_fx"] = greeks["delta_fx"] * shocks["fx_pct"]
    parts["gamma_fx"] = 0.5 * greeks["gamma_fx"] * shocks["fx_pct"] ** 2
    parts["vega"] = greeks["vega"] * shocks["vol_pts"]
    approx = sum(parts.values())
    return {"full": full, "approx": approx, "unexplained": full - approx, "parts": parts}


def default_positions(kind: str, notional: float, maturity: float, market: dict) -> list[dict]:
    """Monta a(s) posição(ões) de exemplo, contratadas a mercado (valor inicial zero nos derivativos)."""
    fwd = forward_fx(market, maturity)
    specs = {
        "ltn": {"kind": "ltn", "notional": notional / 1000, "maturity": maturity},
        "ntnf": {"kind": "ntnf", "notional": notional / 1000, "maturity": maturity},
        "ntnb": {"kind": "ntnb", "notional": notional / 4500, "maturity": maturity, "vna": 4500.0},
        "swap_fx": {"kind": "swap_fx", "notional": notional, "maturity": maturity,
                    "spot0": market["spot"], "cupom0": rate(market["cupom"], maturity)},
        "ndf": {"kind": "ndf", "notional": notional / market["spot"], "maturity": maturity, "strike": fwd},
        "call_fx": {"kind": "call_fx", "notional": notional / market["spot"], "maturity": maturity, "strike": fwd},
    }
    return list(specs.values()) if kind == "portfolio" else [specs[kind]]


def flat_market(pre: float, cupom: float, ipca: float, spot: float, vol: float, slope: float = 0.0) -> dict:
    """Mercado com curvas flat (e inclinação opcional, em pontos por ano de prazo)."""
    tilt = slope * (VERTICES - VERTICES[0])
    return {"pre": pre + tilt, "cupom": cupom + 0 * tilt, "ipca": ipca + tilt, "spot": spot, "vol": vol}


def run(p: dict) -> dict:
    market = flat_market(p["pre"], p["cupom"], p["ipca"], p["spot"], p["vol"], p["slope"])
    positions = default_positions(p["instrument"], p["notional"], p["maturity"], market)
    dv01 = key_rate_dv01(positions, market)
    greeks = fx_and_vol_greeks(positions, market)
    return {
        "value": portfolio_value(positions, market),
        "vertices": VERTICES.tolist(),
        "dv01": dv01,
        "dv01_total": {c: float(sum(v)) for c, v in dv01.items()},
        "greeks": greeks,
        "pnl": pnl_explain(positions, market, p["shocks"]),
        "positions": [{"kind": x["kind"], "value": price(x, market)} for x in positions],
    }
