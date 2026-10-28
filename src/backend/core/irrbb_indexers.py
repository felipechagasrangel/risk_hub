"""IRRBB com indexadores brasileiros: risco de base e ΔNII com balanço dinâmico.

Cada posição rende (ou custa) conforme seu indexador, todos derivados da trajetória da Selic:
- CDI ≈ Selic − 0,10 p.p.; posições pós-fixadas pagam % do CDI + spread;
- TR: aproximação didática TR ≈ 0,35 × (Selic − 8%), com piso zero (a TR real vem da TBF com redutor);
- poupança: 0,5% a.m. + TR com Selic acima de 8,5% a.a.; 70% da Selic + TR abaixo disso;
- IPCA: trajetória própria, que não acompanha a Selic de imediato — fonte de risco de base;
- prefixadas: taxa fixa; a parte que vence a cada mês é renovada à taxa de mercado do momento.

ΔNII com balanço constante: o que vence é renovado no mesmo volume. Balanço dinâmico: cada
carteira cresce à sua taxa e o volume novo entra precificado ao mercado.
"""

import numpy as np

POUPANCA_THRESHOLD = 0.085
POUPANCA_FIXED = 1.005 ** 12 - 1  # 0,5% ao mês, anualizado


def cdi(selic: float) -> float:
    return selic - 0.001


def tr(selic: float) -> float:
    return max(0.35 * (selic - 0.08), 0.0)


def poupanca(selic: float) -> float:
    """Regra da poupança (Lei 12.703/2012): remuneração muda de regime em Selic = 8,5%."""
    base = POUPANCA_FIXED if selic > POUPANCA_THRESHOLD else 0.7 * selic
    return base + tr(selic)


def selic_path(selic0: float, delta: float, ramp_months: int, horizon: int) -> np.ndarray:
    """Trajetória mensal da Selic: o choque chega em degraus, nas reuniões do Copom (a cada ~1,5 mês)."""
    meetings = sorted({int(1.5 * k) + 1 for k in range(int(ramp_months / 1.5) + 1)} & set(range(1, ramp_months + 1))) or [1]
    path = np.full(horizon, selic0, dtype=float)
    for m in meetings:
        path[m - 1:] += delta / len(meetings)
    return np.maximum(path, 0.0)


def item_rate(item: dict, selic: float, ipca: float) -> float:
    ix = item["indexer"]
    if ix == "cdi":
        return item["pct"] * cdi(selic) + item["spread"]
    if ix == "selic":
        return selic + item["spread"]
    if ix == "poupanca":
        return poupanca(selic) + item["spread"]
    if ix == "tr":
        return tr(selic) + item["spread"]
    if ix == "ipca":
        return ipca + item["spread"]
    if ix == "zero":
        return item["spread"]
    return item["rate"]  # pré: taxa contratada


def project_nii(items: list[dict], selic0: float, selic: np.ndarray, ipca: np.ndarray, dynamic: bool) -> dict:
    """Margem financeira mensal por posição (ativos somam, passivos subtraem).

    `selic0` é a Selic de hoje: o prefixado é renovado com o mesmo spread sobre o CDI que tem hoje.
    """
    horizon = len(selic)
    total = np.zeros(horizon)
    by_item = []
    for it in items:
        sign = 1 if it["side"] == "asset" else -1
        g = (1 + it["growth"]) ** (1 / 12) - 1 if dynamic else 0.0
        balance, avg_rate = it["amount"], it["rate"]
        spread_over_cdi = it["rate"] - cdi(selic0)
        flows = np.zeros(horizon)
        for m in range(horizon):
            new_balance = balance * (1 + g)
            if it["indexer"] == "pre":
                roll = min(1 / max(it["months"], 1), 1.0)  # fração que vence e é renovada no mês
                new_volume = balance * roll + (new_balance - balance)
                market = cdi(selic[m]) + spread_over_cdi
                avg_rate = (avg_rate * balance * (1 - roll) + market * new_volume) / new_balance
                rate = avg_rate
            else:
                rate = item_rate(it, selic[m], ipca[m])
            balance = new_balance
            flows[m] = sign * balance * rate / 12
        total += flows
        by_item.append({"name": it["name"], "indexer": it["indexer"], "side": it["side"], "monthly": flows})
    return {"total": total, "by_item": by_item}


def _ipca_path(ipca0: float, shock: float, horizon: int) -> np.ndarray:
    return np.full(horizon, ipca0 + shock)


def basis_run(p: dict) -> dict:
    """Risco de base: ΔNII de 12 meses para vários níveis finais de Selic e para um choque de IPCA."""
    h = 12
    ipca = _ipca_path(p["ipca"], 0.0, h)
    base = project_nii(p["items"], p["selic"], selic_path(p["selic"], 0.0, 1, h), ipca, False)
    base_12m = float(base["total"].sum())
    sweep = []
    for bps in range(-800, 801, 100):
        d = bps / 10_000
        if p["selic"] + d < 0.0:
            continue
        r = project_nii(p["items"], p["selic"], selic_path(p["selic"], d, p["ramp_months"], h), ipca, False)
        sweep.append({"shock_bps": bps, "selic_final": p["selic"] + d, "nii": float(r["total"].sum()),
                      "delta_nii": float(r["total"].sum()) - base_12m})

    def breakdown(d_selic: float, d_ipca: float) -> list[dict]:
        r = project_nii(p["items"], p["selic"], selic_path(p["selic"], d_selic, p["ramp_months"], h),
                        _ipca_path(p["ipca"], d_ipca, h), False)
        return [{"name": b["name"], "indexer": b["indexer"],
                 "delta": float(b["monthly"].sum() - b0["monthly"].sum())}
                for b, b0 in zip(r["by_item"], base["by_item"])]

    rates = [{"selic": s / 1000, "cdi": cdi(s / 1000), "tr": tr(s / 1000), "poupanca": poupanca(s / 1000)}
             for s in range(20, 201, 5)]
    return {
        "base_nii": base_12m, "sweep": sweep, "rates": rates,
        "selic_shock": {"bps": p["shock_bps"], "items": breakdown(p["shock_bps"] / 10_000, 0.0)},
        "ipca_shock": {"bps": p["ipca_shock_bps"], "items": breakdown(0.0, p["ipca_shock_bps"] / 10_000)},
        "current": {"cdi": cdi(p["selic"]), "tr": tr(p["selic"]), "poupanca": poupanca(p["selic"])},
    }


def dynamic_run(p: dict) -> dict:
    """ΔNII em cenários de Copom, com balanço constante e dinâmico."""
    h = p["horizon"]
    ipca = _ipca_path(p["ipca"], 0.0, h)
    out = {"months": list(range(1, h + 1)), "scenarios": []}
    paths = {}
    for sc in p["scenarios"]:
        path = selic_path(p["selic"], sc["delta_bps"] / 10_000, sc["ramp_months"], h)
        paths[sc["name"]] = path
        row = {"name": sc["name"], "selic": path.tolist()}
        for mode, dyn in (("constant", False), ("dynamic", True)):
            r = project_nii(p["items"], p["selic"], path, ipca, dyn)
            row[mode] = r["total"].tolist()
            row[f"{mode}_12m"] = float(r["total"][:12].sum())
            row[f"{mode}_total"] = float(r["total"].sum())
        out["scenarios"].append(row)
    base = out["scenarios"][0]
    for row in out["scenarios"]:
        for mode in ("constant", "dynamic"):
            row[f"{mode}_delta_12m"] = row[f"{mode}_12m"] - base[f"{mode}_12m"]
            row[f"{mode}_delta_total"] = row[f"{mode}_total"] - base[f"{mode}_total"]
    return out
