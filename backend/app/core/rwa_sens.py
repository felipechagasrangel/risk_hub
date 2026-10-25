"""RWA SENS — Delta e Curvatura de juros (GIRR) e Delta de moedas (FX).

Parâmetros conforme a Resolução BCB nº 470/2025 (texto anexo ao Voto BCB nº 42/2025):
- Delta: vértices do art. 9º, ponderadores dos Anexos I e I-A, correlações do Anexo VII
  e arts. 31, 32, 38–42;
- Curvatura: arts. 83, 90, 95–98, 100, 102, 108–115. O CVR⁻ usa o termo linear com sinal
  positivo, como em Basileia (MAR21.5), correção trazida pela Resolução BCB nº 592/2026;
- Delta FX: arts. 15, 20, 28, 30 (VI), 48 e 51.

Simplificações: sem Vega, RRAO e demais classes de risco; sem o fator de expectativas de
índices de preço; as linhas de DV01 são tratadas como lineares (CVR nulo) e só as opções
sobre DI1 geram curvatura.
"""

from math import sqrt

import numpy as np

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
    return compute(curves, [], [], brazil_investment_grade)


# ---------------------------------------------------------------- Curvatura

RW_CURV_GIRR = 0.017  # art. 96, I: choque paralelo de ±1,7% na curva
RHO_CURV_GIRR = 0.998  # art. 102: entre curvas da mesma moeda
GAMMA_CURV_GIRR = 0.25  # art. 112, I: entre moedas
PU_FACE = 100_000.0  # valor de face do contrato DI1
_GH_X, _GH_W = np.polynomial.hermite_e.hermegauss(80)
_GH_W = _GH_W / np.sqrt(2 * np.pi)


def di1_pu(rate: float | np.ndarray, business_days: float):
    return PU_FACE / (1 + rate) ** (business_days / 252)


def di_option_value(opt: dict, shift: float = 0.0) -> float:
    """Opção europeia sobre a taxa do DI1, com taxa terminal normal (modelo de Bachelier).

    Call de taxa ganha se a taxa subir: paga PU(K) − PU(r_T) por contrato; put, o inverso.
    `shift` é um deslocamento paralelo da curva (decimal). Sem desconto do prêmio.
    """
    t = opt["expiry_du"] / 252
    remaining = opt["underlying_du"] - opt["expiry_du"]
    r_t = opt["rate"] + shift + opt["vol"] * sqrt(t) * _GH_X
    payoff = di1_pu(opt["strike"], remaining) - di1_pu(r_t, remaining)
    if opt["kind"] == "put":
        payoff = -payoff
    return float(opt["quantity"] * (_GH_W * np.maximum(payoff, 0.0)).sum())


def option_dv01(opt: dict) -> float:
    return di_option_value(opt, 0.0001) - di_option_value(opt, 0.0)


def cvr(opt: dict) -> tuple[float, float]:
    """Art. 95: perda além da aproximação linear nos choques +RW e −RW."""
    v0 = di_option_value(opt)
    s = option_dv01(opt) / 0.0001  # art. 90: soma das sensibilidades Delta da curva
    up = -(di_option_value(opt, RW_CURV_GIRR) - v0 - RW_CURV_GIRR * s)
    down = -(di_option_value(opt, -RW_CURV_GIRR) - v0 + RW_CURV_GIRR * s)
    return up, down


def _psi(a: float, b: float) -> float:
    return 0.0 if a < 0 and b < 0 else 1.0


def _curvature_category(up: list[float], down: list[float], scenario: str) -> tuple[float, float]:
    """Art. 100 §2: K_b = max(K⁺, K⁻); devolve (K_b, S_b do lado escolhido)."""
    rho = stress_correlation(RHO_CURV_GIRR, scenario)

    def side(c: list[float]) -> float:
        total = sum(max(0.0, x) ** 2 for x in c)
        total += sum(rho * a * b * _psi(a, b) for i, a in enumerate(c) for j, b in enumerate(c) if i != j)
        return sqrt(max(0.0, total))

    k_up, k_down = side(up), side(down)
    if k_up > k_down or (k_up == k_down and sum(up) >= sum(down)):
        return k_up, sum(up)
    return k_down, sum(down)


def _curvature_class(k: dict[str, float], s: dict[str, float], scenario: str) -> float:
    """Art. 110: agregação entre moedas com γ e ψ."""
    gamma = stress_correlation(GAMMA_CURV_GIRR, scenario)
    total = sum(v ** 2 for v in k.values())
    total += sum(gamma * s[b] * s[c] * _psi(s[b], s[c]) for b in k for c in k if b != c)
    return sqrt(max(0.0, total))


# ---------------------------------------------------------------- Delta FX

RW_FX = 0.15  # art. 30, VI: ponderador único para todos os pares
GAMMA_FX = 0.60  # art. 48: entre pares de moedas


def fx_delta(exposures: list[dict]) -> dict:
    """Delta FX: cada par real × moeda é um fator e uma categoria (arts. 15, 20, 28).

    Para instrumentos lineares, a sensibilidade do art. 20, (V(1,01·FX) − V(FX)) / 0,01,
    é a própria exposição líquida em reais; as exposições da mesma moeda se somam (art. 21).
    """
    ns: dict[str, float] = {}
    for e in exposures:
        ns[e["currency"]] = ns.get(e["currency"], 0.0) + e["exposure"]
    ws = {c: v * RW_FX for c, v in ns.items()}
    k = {c: abs(w) for c, w in ws.items()}  # um único fator por categoria
    scenarios = {sc: _class_requirement(k, ws, stress_correlation(GAMMA_FX, sc)) if ws else 0.0
                 for sc in SCENARIOS}
    return {
        "currencies": [{"currency": c, "net_sensitivity": ns[c], "weighted_sensitivity": ws[c]}
                       for c in sorted(ns)],
        "scenarios": scenarios,
        "risk_weight": RW_FX,
    }


def compute(curves: list[dict], options: list[dict], fx: list[dict],
            brazil_investment_grade: bool) -> dict:
    """Delta GIRR + Delta FX + Curvatura GIRR por cenário. Opções sobre DI1 entram no Delta
    da curva `curve` (em BRL)."""
    curves = [dict(c, dv01=list(c["dv01"])) for c in curves]
    option_rows = []
    for o in options:
        dv01 = option_dv01(o)
        up, down = cvr(o)
        target = next((c for c in curves if c["name"] == o["curve"] and c["currency"] == "BRL"), None)
        if target is None:
            target = {"name": o["curve"], "currency": "BRL", "settlement": "BRL", "dv01": [0.0] * len(VERTICES_DU)}
            curves.append(target)
        target["dv01"][VERTICES_DU.index(o["underlying_du"])] += dv01
        option_rows.append({"name": o["name"], "curve": o["curve"], "value": di_option_value(o),
                            "dv01": dv01, "cvr_up": up, "cvr_down": down})

    delta = _girr_delta(curves, brazil_investment_grade)

    # Curvatura: um fator por curva; categorias por moeda (aqui, só curvas em reais)
    by_curve: dict[str, list[float]] = {}
    for r in option_rows:
        acc = by_curve.setdefault(r["curve"], [0.0, 0.0])
        acc[0] += r["cvr_up"]
        acc[1] += r["cvr_down"]
    curvature = {}
    for scen in SCENARIOS:
        if by_curve:
            kb, sb = _curvature_category([v[0] for v in by_curve.values()], [v[1] for v in by_curve.values()], scen)
            curvature[scen] = _curvature_class({"BRL": kb}, {"BRL": sb}, scen)
        else:
            curvature[scen] = 0.0

    fx_result = fx_delta(fx)
    # Art. 51: os Deltas das classes se somam; depois soma-se a Curvatura, cenário a cenário
    totals = {sc: delta["scenarios"][sc]["delta"] + fx_result["scenarios"][sc] + curvature[sc]
              for sc in SCENARIOS}
    binding = max(SCENARIOS, key=lambda sc: totals[sc])
    shock_bps = round(RW_CURV_GIRR * 10000)
    shifts = [x / 10000 for x in sorted(set(range(-300, 301, 25)) | {-shock_bps, shock_bps})]
    profile = [{
        "shift_bps": round(sh * 10000),
        "value": sum(di_option_value(o, sh) for o in options),
        "linear": sum(di_option_value(o) + option_dv01(o) / 0.0001 * sh for o in options),
    } for sh in shifts]
    return {
        **delta,
        "curvature": {
            "options": option_rows,
            "cvr_up": sum(r["cvr_up"] for r in option_rows),
            "cvr_down": sum(r["cvr_down"] for r in option_rows),
            "scenarios": curvature,
            "shock": RW_CURV_GIRR,
            "profile": profile if options else [],
        },
        "fx": fx_result,
        "totals": totals,
        "binding_scenario": binding,
        "requirement": totals[binding],
        "rwa": totals[binding] / F,
    }


def _girr_delta(curves: list[dict], brazil_investment_grade: bool) -> dict:
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
