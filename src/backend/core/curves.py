"""Construção de curvas: curva pré a partir do DI1 e cupom cambial a partir do dólar futuro.

Convenções brasileiras:
- pré: exponencial base 252 em dias úteis (DU): fator = (1 + r)^(DU/252);
- cupom cambial: linear base 360 em dias corridos (DC): fator = 1 + c · DC/360.

O DI1 é um contrato sobre o CDI acumulado até o vencimento, então cada taxa negociada já é a
taxa zero daquele prazo — não é preciso bootstrapping, só interpolar entre os vértices.
"""

import numpy as np

PU_FACE = 100_000.0


def di1_pu(rate: float, du: int) -> float:
    """PU do DI1: 100.000 pontos no vencimento, descontados pela taxa negociada."""
    return PU_FACE / (1 + rate) ** (du / 252)


def flat_forward(du_nodes: np.ndarray, rates: np.ndarray, du: float) -> float:
    """Interpolação flat-forward 252: taxa a termo constante entre dois vértices.

    Equivale a interpolar linearmente o log do fator de capitalização. Fora do último
    vértice, mantém a última taxa a termo (extrapolação flat-forward).
    """
    factors = (1 + rates) ** (du_nodes / 252)
    i = int(np.clip(np.searchsorted(du_nodes, du), 1, len(du_nodes) - 1))
    d1, d2 = du_nodes[i - 1], du_nodes[i]
    f1, f2 = factors[i - 1], factors[i]
    factor = f1 * (f2 / f1) ** ((du - d1) / (d2 - d1))
    return factor ** (252 / du) - 1


def linear(du_nodes: np.ndarray, rates: np.ndarray, du: float) -> float:
    """Interpolação linear nas taxas (simples, mas gera termos em dente de serra)."""
    return float(np.interp(du, du_nodes, rates))


def natural_spline(du_nodes: np.ndarray, rates: np.ndarray):
    """Spline cúbica natural nas taxas: suave, mas pode oscilar entre vértices."""
    x, y = du_nodes.astype(float), rates.astype(float)
    n = len(x)
    h = np.diff(x)
    a = np.zeros((n, n))
    b = np.zeros(n)
    a[0, 0] = a[-1, -1] = 1.0
    for i in range(1, n - 1):
        a[i, i - 1], a[i, i], a[i, i + 1] = h[i - 1], 2 * (h[i - 1] + h[i]), h[i]
        b[i] = 3 * ((y[i + 1] - y[i]) / h[i] - (y[i] - y[i - 1]) / h[i - 1])
    c = np.linalg.solve(a, b)

    def evaluate(t: float) -> float:
        i = int(np.clip(np.searchsorted(x, t) - 1, 0, n - 2))
        dt = t - x[i]
        bi = (y[i + 1] - y[i]) / h[i] - h[i] * (2 * c[i] + c[i + 1]) / 3
        di = (c[i + 1] - c[i]) / (3 * h[i])
        return float(y[i] + bi * dt + c[i] * dt**2 + di * dt**3)

    return evaluate


def forward_rate(r1: float, du1: float, r2: float, du2: float) -> float:
    """Taxa a termo entre dois prazos: o que se ganha entre du1 e du2, implícito na curva."""
    return ((1 + r2) ** (du2 / 252) / (1 + r1) ** (du1 / 252)) ** (252 / (du2 - du1)) - 1


def pre_curve(contracts: list[dict], cdi: float, step: int = 5) -> dict:
    """Curva pré: CDI no vértice de 1 DU e uma taxa por contrato de DI1, interpolada de três jeitos."""
    nodes = sorted([{"label": "CDI", "du": 1, "rate": cdi}] + contracts, key=lambda c: c["du"])
    du_nodes = np.array([c["du"] for c in nodes], dtype=float)
    rates = np.array([c["rate"] for c in nodes], dtype=float)
    spline = natural_spline(du_nodes, rates)
    methods = {
        "flat_forward": lambda d: flat_forward(du_nodes, rates, d),
        "linear": lambda d: linear(du_nodes, rates, d),
        "spline": spline,
    }
    grid = np.arange(1, int(du_nodes[-1]) + 1, step)
    curve, forwards = [], []
    for d in grid:
        curve.append({"du": int(d), **{m: f(d) for m, f in methods.items()}})
        if d + step <= du_nodes[-1]:
            # termo de curto prazo (step DU) ao longo da curva: mostra o formato de cada método
            forwards.append({"du": int(d), **{m: forward_rate(f(d), d, f(d + step), d + step)
                                             for m, f in methods.items()}})
    fras = [{
        "from": a["label"], "to": b["label"], "du_from": a["du"], "du_to": b["du"],
        "forward": forward_rate(a["rate"], a["du"], b["rate"], b["du"]),
    } for a, b in zip(nodes, nodes[1:])]
    table = [{**c, "pu": di1_pu(c["rate"], c["du"])} for c in nodes if c["label"] != "CDI"]
    return {"curve": curve, "forwards": forwards, "fras": fras, "contracts": table}


def implied_cupom(spot: float, future: float, pre: float, du: int, dc: int) -> float:
    """Cupom cambial pela paridade coberta: (1 + c·DC/360) = (1 + pré)^(DU/252) · S / F."""
    return ((1 + pre) ** (du / 252) * spot / future - 1) * 360 / dc


def cupom_curve(contracts: list[dict], cdi: float, fx: list[dict], spot: float, ptax: float) -> list[dict]:
    """Cupom limpo (com o dólar à vista) e sujo (com a PTAX de D−1) para cada vencimento do DOL,
    e o FRC implícito entre vencimentos consecutivos."""
    nodes = sorted([{"du": 1, "rate": cdi}] + contracts, key=lambda c: c["du"])
    du_nodes = np.array([c["du"] for c in nodes], dtype=float)
    rates = np.array([c["rate"] for c in nodes], dtype=float)
    out, previous = [], None
    for f in sorted(fx, key=lambda x: x["du"]):
        pre = flat_forward(du_nodes, rates, f["du"])
        clean = implied_cupom(spot, f["price"], pre, f["du"], f["dc"])
        dirty = implied_cupom(ptax, f["price"], pre, f["du"], f["dc"])
        frc = None
        if previous is not None:
            # FRC: o cupom a termo entre dois vencimentos (linear 360)
            frc = ((1 + clean * f["dc"] / 360) / (1 + previous[0] * previous[1] / 360) - 1) * 360 / (f["dc"] - previous[1])
        out.append({**f, "pre": pre, "clean": clean, "dirty": dirty, "frc": frc})
        previous = (clean, f["dc"])
    return out
