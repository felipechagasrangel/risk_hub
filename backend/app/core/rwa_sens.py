"""RWA SENS — componente Delta da classe GIRR (juros livres de risco).

Parâmetros conforme a Resolução BCB nº 470/2025 (texto anexo ao Voto BCB nº 42/2025):
vértices do art. 9º, ponderadores dos Anexos I e I-A, correlações do Anexo VII e
arts. 31, 32, 38–42.

Simplificações: só Delta GIRR (sem Vega, Curvatura, RRAO e demais classes de risco) e
sem o fator de risco de expectativas de índices de preço.
"""

from math import sqrt

VERTICES_DU = [1, 63, 126, 252, 504, 756, 1260, 2520, 3780, 5040, 7560]

# Anexo I (categoria Reais) e Anexo I-A (demais categorias): fator por vértice
RW_VERTEX_BRL = [0.0, 0.032, 0.032, 0.031, 0.028, 0.027, 0.026, 0.026, 0.026, 0.026, 0.026]
RW_VERTEX_OTHER = [0.0, 0.017, 0.017, 0.016, 0.013, 0.012, 0.011, 0.011, 0.011, 0.011, 0.011]

# Moedas com fator de categoria 0,7071 quando denominação = liquidação (art. 30, VII, b, 2)
LIQUID_CURRENCIES = {"EUR", "USD", "GBP", "AUD", "JPY", "SEK", "CAD"}

# Anexo VII: correlação entre vértices b..k (63 a 7.560 DU) da mesma curva.
# O vértice de 1 DU tem ponderador zero e não entra na tabela.
_ANNEX_VII = [
    [1.000, 0.970, 0.914, 0.811, 0.719, 0.566, 0.400, 0.400, 0.400, 0.400],
    [0.970, 1.000, 0.970, 0.914, 0.861, 0.763, 0.566, 0.419, 0.400, 0.400],
    [0.914, 0.970, 1.000, 0.970, 0.942, 0.887, 0.763, 0.657, 0.566, 0.419],
    [0.811, 0.914, 0.970, 1.000, 0.985, 0.956, 0.887, 0.823, 0.763, 0.657],
    [0.719, 0.861, 0.942, 0.985, 1.000, 0.980, 0.932, 0.887, 0.844, 0.763],
    [0.566, 0.763, 0.887, 0.956, 0.980, 1.000, 0.970, 0.942, 0.914, 0.861],
    [0.400, 0.566, 0.763, 0.887, 0.932, 0.970, 1.000, 0.985, 0.970, 0.942],
    [0.400, 0.419, 0.657, 0.823, 0.887, 0.942, 0.985, 1.000, 0.990, 0.970],
    [0.400, 0.400, 0.566, 0.763, 0.844, 0.914, 0.970, 0.990, 1.000, 0.985],
    [0.400, 0.400, 0.419, 0.657, 0.763, 0.861, 0.942, 0.970, 0.985, 1.000],
]
SAME_VERTEX_OTHER_CURVE = 0.999
GAMMA_GIRR = 0.50  # art. 42: correlação entre categorias (moedas)
F = 0.08
SCENARIOS = ("medium", "high", "low")


def vertex_correlation(i: int, j: int) -> float:
    """Correlação média entre dois vértices da mesma curva (índices em VERTICES_DU)."""
    if i == j:
        return 1.0
    if i == 0 or j == 0:
        return 0.0  # irrelevante: ponderador do vértice de 1 DU é zero
    return _ANNEX_VII[i - 1][j - 1]


def stress_correlation(rho: float, scenario: str) -> float:
    """Arts. 38 e 39: correlações dos cenários alta e baixa a partir da média."""
    if scenario == "high":
        return min(1.25 * rho, 1.0)
    if scenario == "low":
        return max(2 * rho - 1, 0.75 * rho)
    return rho


def category_factor(currency: str, settlement: str, brazil_investment_grade: bool) -> float:
    if currency == "BRL":
        return 0.7071 if brazil_investment_grade else 1.0
    if currency == settlement and currency in LIQUID_CURRENCIES:
        return 0.7071
    return 1.0


def risk_weights(currency: str, settlement: str, brazil_investment_grade: bool) -> list[float]:
    vertex = RW_VERTEX_BRL if currency == "BRL" else RW_VERTEX_OTHER
    f = category_factor(currency, settlement, brazil_investment_grade)
    return [f * v for v in vertex]


def _category_position(factors: list[dict], scenario: str) -> float:
    """Art. 31 §2: K_b = sqrt(max(0, Σ WS² + ΣΣ ρ WS_k WS_l))."""
    total = 0.0
    for a in factors:
        for b in factors:
            if a is b:
                total += a["ws"] ** 2
                continue
            rho = vertex_correlation(a["vertex"], b["vertex"])
            if a["curve"] != b["curve"]:
                rho *= SAME_VERTEX_OTHER_CURVE  # art. 32, I e III
            total += stress_correlation(rho, scenario) * a["ws"] * b["ws"]
    return sqrt(max(0.0, total))


def _class_requirement(k: dict[str, float], s: dict[str, float], gamma: float) -> float:
    """Art. 40: agregação entre categorias, com S_b limitado a ±K_b se a soma ficar negativa."""
    def agg(sb: dict[str, float]) -> float:
        cats = list(k)
        return sum(k[b] ** 2 for b in cats) + sum(
            gamma * sb[b] * sb[c] for b in cats for c in cats if b != c)

    a = agg(s)
    if a >= 0:
        return sqrt(a)
    clipped = {b: max(min(s[b], k[b]), -k[b]) for b in k}
    return sqrt(max(agg(clipped), 0.0))


def girr_delta(curves: list[dict], brazil_investment_grade: bool) -> dict:
    """Cada curva: name, currency (categoria), settlement e dv01 por vértice (R$ por +1 bp)."""
    factors, curve_rows = [], []
    for idx, c in enumerate(curves):
        rw = risk_weights(c["currency"], c["settlement"], brazil_investment_grade)
        sens = [d / 0.0001 for d in c["dv01"]]  # art. 16: (V(r + 1bp) − V(r)) / 0,0001
        ws = [s * w for s, w in zip(sens, rw)]
        curve_rows.append({
            "name": c["name"], "currency": c["currency"], "settlement": c["settlement"],
            "category_factor": category_factor(c["currency"], c["settlement"], brazil_investment_grade),
            "risk_weights": rw, "weighted_sensitivities": ws,
        })
        factors += [{"curve": idx, "currency": c["currency"], "vertex": v, "ws": w}
                    for v, w in enumerate(ws) if w != 0]

    categories = sorted({c["currency"] for c in curves})
    by_scenario = {}
    for scen in SCENARIOS:
        k = {b: _category_position([f for f in factors if f["currency"] == b], scen) for b in categories}
        s = {b: sum(f["ws"] for f in factors if f["currency"] == b) for b in categories}
        delta = _class_requirement(k, s, stress_correlation(GAMMA_GIRR, scen))
        by_scenario[scen] = {"delta": delta, "categories": [
            {"currency": b, "k": k[b], "s": s[b]} for b in categories]}

    binding = max(SCENARIOS, key=lambda sc: by_scenario[sc]["delta"])
    requirement = by_scenario[binding]["delta"]
    n = len(VERTICES_DU)
    return {
        "vertices": VERTICES_DU,
        "curves": curve_rows,
        "scenarios": by_scenario,
        "binding_scenario": binding,
        "requirement": requirement,
        "rwa": requirement / F,
        "correlation": {sc: [[stress_correlation(vertex_correlation(i, j), sc) for j in range(1, n)]
                             for i in range(1, n)] for sc in SCENARIOS},
    }
