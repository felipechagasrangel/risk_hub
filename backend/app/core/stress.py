"""Stress testing de mercado: cenários históricos, hipotéticos e stress reverso.

Cada posição é exposta a um fator de risco:
- equity: P&L = valor × choque no índice;
- fx:     P&L = valor × choque no câmbio (exposição comprada em dólar, em reais);
- rates:  P&L = valor × (−D × Δy + ½ × C × Δy²), aproximação por duration e convexidade.

As magnitudes dos cenários históricos são aproximadas e servem para ilustrar ordens de grandeza.
"""

from app.core import market

FACTORS = ("equity", "fx", "rates")

SCENARIOS = [
    {
        "key": "gfc_2008", "kind": "histórico", "name": "Crise financeira global",
        "period": "set–out/2008",
        "description": "Quebra do Lehman Brothers: fuga para o dólar, bolsa despencando e prêmio nos juros futuros.",
        "shocks": {"equity": -0.40, "fx": 0.45, "rates": 0.025},
    },
    {
        "key": "taper_2013", "kind": "histórico", "name": "Taper tantrum",
        "period": "mai–ago/2013",
        "description": "O Fed sinaliza a retirada de estímulos e emergentes sofrem saída de capital.",
        "shocks": {"equity": -0.12, "fx": 0.20, "rates": 0.03},
    },
    {
        "key": "joesley_2017", "kind": "histórico", "name": "Joesley Day",
        "period": "18/05/2017 (1 dia)",
        "description": "Delação envolvendo o presidente: circuit breaker na bolsa em um único pregão.",
        "shocks": {"equity": -0.088, "fx": 0.08, "rates": 0.015},
    },
    {
        "key": "covid_2020", "kind": "histórico", "name": "Covid-19",
        "period": "fev–mar/2020",
        "description": "Pandemia: a bolsa cai quase pela metade em cinco semanas, com seis circuit breakers.",
        "shocks": {"equity": -0.45, "fx": 0.20, "rates": 0.015},
    },
    {
        "key": "fiscal", "kind": "hipotético", "name": "Choque fiscal doméstico",
        "period": "hipotético",
        "description": "Perda de credibilidade fiscal: real se desvaloriza e a curva de juros abre forte.",
        "shocks": {"equity": -0.20, "fx": 0.25, "rates": 0.04},
    },
    {
        "key": "decorrelation", "kind": "hipotético", "name": "Quebra de correlação",
        "period": "hipotético",
        "description": "Bolsa cai junto com o dólar: o hedge cambial deixa de funcionar.",
        "shocks": {"equity": -0.25, "fx": -0.10, "rates": -0.01},
    },
]


def position_pnl(p: dict, shocks: dict) -> float:
    s = shocks[p["factor"]]
    if p["factor"] == "rates":
        return p["value"] * (-p["duration"] * s + 0.5 * p["convexity"] * s**2)
    return p["value"] * s


def factor_correlation(positions: list[dict], rho: dict) -> list[list[float]]:
    """Monta a matriz n×n a partir das correlações entre fatores (mesmo fator → 1)."""
    def pair(a: str, b: str) -> float:
        if a == b:
            return 1.0
        return rho["_".join(sorted((a, b)))]
    return [[pair(a["factor"], b["factor"]) for b in positions] for a in positions]


def run(positions: list[dict], rho: dict, confidence: float,
        loss_limit: float, custom: dict | None) -> dict:
    scenarios = SCENARIOS + ([{
        "key": "custom", "kind": "personalizado", "name": "Cenário personalizado",
        "period": "—", "description": "Choques definidos por você.", "shocks": custom,
    }] if custom else [])

    corr = factor_correlation(positions, rho)
    values = [p["value"] for p in positions]
    vols = [p["vol_annual"] for p in positions]
    var_1d = market.portfolio_var(values, vols, corr, confidence, 1)["diversified_var"]
    var_10d = market.portfolio_var(values, vols, corr, confidence, 10)["diversified_var"]

    results = []
    for s in scenarios:
        pnls = [position_pnl(p, s["shocks"]) for p in positions]
        total = sum(pnls)
        loss = -total
        results.append({
            **s,
            "pnl_by_position": pnls,
            "total_pnl": total,
            "loss_vs_var_10d": loss / var_10d if var_10d else None,
            # Stress reverso (linear): por quanto multiplicar o cenário para atingir o limite
            "reverse_multiplier": loss_limit / loss if loss > 0 else None,
        })
    worst = min(results, key=lambda r: r["total_pnl"])
    return {
        "positions": [p["name"] for p in positions],
        "var_1d": var_1d,
        "var_10d": var_10d,
        "scenarios": results,
        "worst_scenario": worst["key"],
        "loss_limit": loss_limit,
    }
