"""IRRBB: risco de taxa de juros na carteira bancária — ΔEVE, ΔNII e gap de repricing.

Simplificações didáticas:
- curva base em taxas contínuas, interpolação linear e extrapolação flat;
- cada posição é um bullet de taxa fixa que paga cupom anual até a data de
  repricing/vencimento (posições pós-fixadas = repricing curto);
- ΔNII com balanço constante em 12 meses, sem margens comerciais.
"""

from math import exp, floor

SCENARIOS = ["parallel_up", "parallel_down", "steepener", "flattener", "short_up", "short_down"]
DECAY = 4.0  # parâmetro x do Basileia (anos) para choques curtos e longos
NII_HORIZON = 1.0
BUCKETS = [  # (rótulo, início, fim) em anos
    ("0-1m", 0, 1 / 12), ("1-3m", 1 / 12, 0.25), ("3-6m", 0.25, 0.5), ("6-12m", 0.5, 1),
    ("1-2a", 1, 2), ("2-3a", 2, 3), ("3-5a", 3, 5), ("5-10a", 5, 10), ("10a+", 10, float("inf")),
]


def interpolate(curve: list[dict], t: float) -> float:
    pts = sorted(curve, key=lambda p: p["tenor"])
    if t <= pts[0]["tenor"]:
        return pts[0]["rate"]
    for a, b in zip(pts, pts[1:]):
        if t <= b["tenor"]:
            w = (t - a["tenor"]) / (b["tenor"] - a["tenor"])
            return a["rate"] + w * (b["rate"] - a["rate"])
    return pts[-1]["rate"]


def shock(scenario: str, t: float, parallel: float, short: float, long: float) -> float:
    """Choques padronizados do BCBS (d368), em taxa decimal."""
    s = short * exp(-t / DECAY)
    lg = long * (1 - exp(-t / DECAY))
    return {
        "base": 0.0,
        "parallel_up": parallel,
        "parallel_down": -parallel,
        "short_up": s,
        "short_down": -s,
        "steepener": -0.65 * s + 0.9 * lg,
        "flattener": 0.8 * s - 0.6 * lg,
    }[scenario]


def cash_flows(p: dict) -> list[tuple[float, float]]:
    """Fluxos (tempo, valor) de um bullet com cupom anual até `repricing` anos."""
    T, amount, rate = p["repricing"], p["amount"], p["rate"]
    times = [float(k) for k in range(1, floor(T) + 1)]
    if not times or times[-1] < T - 1e-9:
        times.append(T)
    flows, prev = [], 0.0
    for t in times:
        flows.append((t, amount * rate * (t - prev)))
        prev = t
    flows[-1] = (flows[-1][0], flows[-1][1] + amount)
    return flows


def present_value(p: dict, curve: list[dict], scenario: str, shocks: dict) -> tuple[float, float]:
    """Retorna (PV, PV × tempo) — o segundo serve para a duration."""
    pv = pv_t = 0.0
    for t, cf in cash_flows(p):
        r = interpolate(curve, t) + shock(scenario, t, **shocks)
        d = cf * exp(-r * t)
        pv += d
        pv_t += d * t
    return pv, pv_t


def eve(positions: list[dict], curve: list[dict], scenario: str, shocks: dict) -> dict:
    out = {"asset": [0.0, 0.0], "liability": [0.0, 0.0]}
    for p in positions:
        pv, pv_t = present_value(p, curve, scenario, shocks)
        out[p["side"]][0] += pv
        out[p["side"]][1] += pv_t
    a, l = out["asset"], out["liability"]
    return {
        "pv_assets": a[0], "pv_liabilities": l[0], "eve": a[0] - l[0],
        "duration_assets": a[1] / a[0] if a[0] else 0.0,
        "duration_liabilities": l[1] / l[0] if l[0] else 0.0,
    }


def nii(positions: list[dict], scenario: str, shocks: dict) -> dict:
    base = delta = 0.0
    for p in positions:
        sign = 1 if p["side"] == "asset" else -1
        base += sign * p["amount"] * p["rate"]
        T = p["repricing"]
        if T < NII_HORIZON:
            delta += sign * p["amount"] * shock(scenario, T, **shocks) * (NII_HORIZON - T)
    return {"base_nii": base, "delta_nii": delta}


def repricing_gap(positions: list[dict]) -> list[dict]:
    rows, cumulative = [], 0.0
    for label, lo, hi in BUCKETS:
        a = sum(p["amount"] for p in positions if p["side"] == "asset" and lo <= p["repricing"] < hi)
        l = sum(p["amount"] for p in positions if p["side"] == "liability" and lo <= p["repricing"] < hi)
        cumulative += a - l
        rows.append({"bucket": label, "assets": a, "liabilities": l,
                     "gap": a - l, "cumulative_gap": cumulative})
    return rows


def analyze(positions: list[dict], curve: list[dict], shocks: dict, tier1: float) -> dict:
    base_eve = eve(positions, curve, "base", shocks)
    base_nii = nii(positions, "base", shocks)
    scenarios = []
    for s in SCENARIOS:
        e = eve(positions, curve, s, shocks)
        n = nii(positions, s, shocks)
        d_eve = e["eve"] - base_eve["eve"]
        scenarios.append({
            "scenario": s, "eve": e["eve"], "delta_eve": d_eve,
            "delta_eve_pct_tier1": d_eve / tier1 if tier1 else None,
            "delta_nii": n["delta_nii"],
        })
    worst = min(scenarios, key=lambda r: r["delta_eve"])
    grid = [1 / 12, 0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30]
    curves = [
        {"tenor": t, "base": interpolate(curve, t),
         **{s: interpolate(curve, t) + shock(s, t, **shocks) for s in SCENARIOS}}
        for t in grid
    ]
    return {
        "base": {**base_eve, **base_nii},
        "scenarios": scenarios,
        "worst_scenario": worst["scenario"],
        # Teste de outlier do Basileia: perda de EVE > 15% do Tier 1
        "outlier": bool(tier1 and -worst["delta_eve"] > 0.15 * tier1),
        "curves": curves,
        "repricing_gap": repricing_gap(positions),
    }
