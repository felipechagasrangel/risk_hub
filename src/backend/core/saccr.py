"""SA-CCR: abordagem padronizada para a exposição (EAD) de derivativos ao risco de contraparte.

Segue Basileia (CRE52), implementada no Brasil pela Circular nº 3.904/2018 (S1 obrigatório; S2 a S4
podem usar o CEM). Cobre as classes de juros (IR) e câmbio (FX), com opções pelo delta supervisório.

    EAD = α · (RC + PFE),  α = 1,4
    PFE = multiplicador · AddOn

Simplificações: um único conjunto de netting, colateral sem haircut, sem classes de crédito, ações e
mercadorias, e sem o MPOR maior para conjuntos grandes ou com disputas.
"""

from math import exp, log, sqrt
from statistics import NormalDist

ALPHA = 1.4
FLOOR = 0.05            # piso do multiplicador
SF = {"ir": 0.005, "fx": 0.04}
SUPERVISORY_VOL = {"ir": 0.50, "fx": 0.15}
BUSINESS_DAYS_YEAR = 250  # convenção do texto de Basileia
_N = NormalDist()


def supervisory_duration(start: float, end: float) -> float:
    """SD = (e^(−0,05·S) − e^(−0,05·E)) / 0,05: o 'notional ajustado' de juros por unidade de nocional."""
    return (exp(-0.05 * start) - exp(-0.05 * end)) / 0.05


def maturity_factor(maturity: float, margined: bool, mpor_days: int) -> float:
    """MF: raiz do prazo (limitado a 1 ano, mínimo 10 dias úteis) sem margem; 1,5·√MPOR com margem."""
    if margined:
        return 1.5 * sqrt(mpor_days / BUSINESS_DAYS_YEAR)
    return sqrt(min(max(maturity, 10 / BUSINESS_DAYS_YEAR), 1.0))


def supervisory_delta(trade: dict) -> float:
    """δ: ±1 para lineares; para opções, a fórmula de Black com a volatilidade supervisória."""
    if trade["kind"] != "fx_option":
        return 1.0 if trade["long"] else -1.0
    vol, t = SUPERVISORY_VOL["fx"], trade["end"]
    d1 = (log(trade["moneyness"]) + 0.5 * vol**2 * t) / (vol * sqrt(t))
    if trade["option"] == "call":
        return _N.cdf(d1) if trade["long"] else -_N.cdf(d1)
    return -_N.cdf(-d1) if trade["long"] else _N.cdf(-d1)


def ir_bucket(end: float) -> int:
    """Faixa de vencimento dos juros: 0 = até 1 ano, 1 = de 1 a 5 anos, 2 = acima de 5 anos."""
    return 0 if end < 1 else 1 if end <= 5 else 2


def trade_terms(trade: dict, margined: bool, mpor_days: int) -> dict:
    """Notional ajustado, delta, fator de prazo e nocional efetivo (δ · d · MF) de uma operação."""
    asset_class = "ir" if trade["kind"] == "ir_swap" else "fx"
    if asset_class == "ir":
        adjusted = trade["notional"] * supervisory_duration(trade["start"], trade["end"])
    else:
        adjusted = trade["notional"]  # FX: nocional da ponta em moeda estrangeira, em reais
    delta = supervisory_delta(trade)
    mf = maturity_factor(trade["end"], margined, mpor_days)
    return {
        "asset_class": asset_class,
        "hedging_set": trade["currency"] if asset_class == "ir" else trade["pair"],
        "bucket": ir_bucket(trade["end"]) if asset_class == "ir" else None,
        "adjusted_notional": adjusted, "delta": delta, "mf": mf,
        "effective": delta * adjusted * mf,
    }


def ir_effective_notional(d: list[float]) -> float:
    """Agregação das três faixas de juros com correlações supervisórias (70% vizinhas, 30% extremas)."""
    d1, d2, d3 = d
    return sqrt(max(d1**2 + d2**2 + d3**2 + 1.4 * d1 * d2 + 1.4 * d2 * d3 + 0.6 * d1 * d3, 0.0))


def add_ons(terms: list[dict]) -> dict:
    """AddOn por conjunto de hedge e por classe. Juros: por moeda, com as 3 faixas. Câmbio: por par."""
    sets: dict[tuple[str, str], list] = {}
    for t in terms:
        key = (t["asset_class"], t["hedging_set"])
        if t["asset_class"] == "ir":
            sets.setdefault(key, [0.0, 0.0, 0.0])[t["bucket"]] += t["effective"]
        else:
            sets.setdefault(key, [0.0])[0] += t["effective"]
    out = []
    for (cls, hs), d in sets.items():
        effective = ir_effective_notional(d) if cls == "ir" else abs(d[0])
        out.append({"asset_class": cls, "hedging_set": hs, "buckets": d,
                    "effective_notional": effective, "add_on": SF[cls] * effective})
    return {"hedging_sets": out, "aggregate": sum(h["add_on"] for h in out)}


def replacement_cost(mtm: float, collateral: float, margined: bool,
                     threshold: float, mta: float, nica: float) -> float:
    """RC sem margem: max(V − C, 0). Com margem: max(V − C, TH + MTA − NICA, 0)."""
    if not margined:
        return max(mtm - collateral, 0.0)
    return max(mtm - collateral, threshold + mta - nica, 0.0)


def multiplier(mtm: float, collateral: float, add_on: float) -> float:
    """Reconhece MTM negativo e excesso de colateral: min(1, 5% + 95%·exp((V − C) / (2·95%·AddOn)))."""
    if add_on <= 0:
        return 1.0
    return min(1.0, FLOOR + (1 - FLOOR) * exp((mtm - collateral) / (2 * (1 - FLOOR) * add_on)))


def saccr_ead(trades: list[dict], netting: dict, margined: bool) -> dict:
    """EAD do conjunto de netting pelo SA-CCR."""
    terms = [trade_terms(t, margined, netting["mpor_days"]) for t in trades]
    addon = add_ons(terms)
    mtm = sum(t["mtm"] for t in trades)
    collateral = netting["collateral"]
    rc = replacement_cost(mtm, collateral, margined, netting["threshold"], netting["mta"], netting["nica"])
    m = multiplier(mtm, collateral, addon["aggregate"])
    pfe = m * addon["aggregate"]
    return {"terms": terms, "add_on": addon, "mtm": mtm, "rc": rc, "multiplier": m,
            "pfe": pfe, "ead": ALPHA * (rc + pfe)}


# CEM (método da exposição corrente): fatores de add-on por prazo — juros e câmbio
CEM_FACTORS = {"ir": (0.0, 0.005, 0.015), "fx": (0.01, 0.05, 0.075)}


def cem_ead(trades: list[dict]) -> dict:
    """CEM com netting: max(V, 0) + (0,4 + 0,6·NGR) · Σ add-ons brutos."""
    gross = 0.0
    for t in trades:
        cls = "ir" if t["kind"] == "ir_swap" else "fx"
        factor = CEM_FACTORS[cls][ir_bucket(t["end"])]
        gross += abs(t["notional"]) * factor  # o CEM usa o nocional, sem delta nem duration
    net_mtm = sum(t["mtm"] for t in trades)
    gross_positive = sum(max(t["mtm"], 0.0) for t in trades)
    ngr = max(net_mtm, 0.0) / gross_positive if gross_positive > 0 else 0.0
    return {"current_exposure": max(net_mtm, 0.0), "gross_add_on": gross, "ngr": ngr,
            "ead": max(net_mtm, 0.0) + (0.4 + 0.6 * ngr) * gross}


def run(p: dict) -> dict:
    trades, netting = p["trades"], p["netting"]
    unmargined = saccr_ead(trades, netting, margined=False)
    margined = saccr_ead(trades, netting, margined=True)
    # Basileia: o EAD com margem não pode passar do EAD do mesmo conjunto sem margem
    margined["ead"] = min(margined["ead"], unmargined["ead"])
    chosen = margined if netting["margined"] else unmargined
    return {
        "chosen": chosen, "unmargined": unmargined, "margined": margined,
        "cem": cem_ead(trades),
        "rwa": chosen["ead"] * p["risk_weight"],
    }
