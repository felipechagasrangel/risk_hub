"""XVA: simulação de Monte Carlo, exposição de contraparte e ajustes de valor.

Modelos:
- GBM (movimento browniano geométrico) para o dólar;
- Hull-White de 1 fator para a taxa curta, com curva inicial flat.

Instrumentos, sempre do ponto de vista do banco:
- swap DI × pré com troca no vencimento (padrão B3), recebendo ou pagando pré;
- NDF de dólar comprado ou vendido.

Taxas internas em capitalização contínua. Simplificações: curva flat, taxas determinísticas no NDF,
sem correlação entre exposição e default (sem wrong-way risk) e margem inicial paramétrica.
"""

from math import sqrt

import numpy as np

Z_99 = 2.3263478740408408  # quantil 99% da normal padrão
MARGIN_HORIZON = 10 / 252  # 10 dias úteis


def time_grid(maturity: float, steps_per_year: int = 52) -> np.ndarray:
    """Datas de simulação, em anos (semanal por padrão)."""
    return np.linspace(0.0, maturity, int(round(maturity * steps_per_year)) + 1)


def simulate_gbm(s0: float, drift: float, sigma: float, times: np.ndarray,
                 n_paths: int, seed: int) -> np.ndarray:
    """GBM: dS = μ S dt + σ S dW. Usa a solução exata em cada passo, sem erro de discretização."""
    rng = np.random.default_rng(seed)
    dt = np.diff(times)
    z = rng.standard_normal((n_paths, len(dt)))
    log_steps = (drift - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z
    log_paths = np.concatenate([np.zeros((n_paths, 1)), np.cumsum(log_steps, axis=1)], axis=1)
    return s0 * np.exp(log_paths)


def simulate_hull_white(r0: float, a: float, sigma: float, times: np.ndarray,
                        n_paths: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Hull-White 1 fator com curva inicial flat em r0 (taxa contínua).

    r(t) = x(t) + α(t), com dx = −a·x dt + σ dW e x(0) = 0. O termo α(t) faz o modelo
    reprecificar a curva inicial. Devolve a taxa curta e sua integral ∫r ds em cada trajetória.
    """
    rng = np.random.default_rng(seed)
    dt = np.diff(times)
    x = np.zeros((n_paths, len(times)))
    for i, h in enumerate(dt):
        decay = np.exp(-a * h)
        step_sd = sigma * np.sqrt((1 - np.exp(-2 * a * h)) / (2 * a))  # transição exata do OU
        x[:, i + 1] = x[:, i] * decay + step_sd * rng.standard_normal(n_paths)
    alpha = r0 + sigma**2 / (2 * a**2) * (1 - np.exp(-a * times)) ** 2
    r = x + alpha
    integral = np.concatenate(
        [np.zeros((n_paths, 1)), np.cumsum(0.5 * (r[:, 1:] + r[:, :-1]) * dt, axis=1)], axis=1)
    return r, integral


def hw_zero_bond(t: float, maturity: float, r_t: np.ndarray, r0: float, a: float, sigma: float) -> np.ndarray:
    """Preço em t de um zero-cupom que vence em T, dado r(t), no Hull-White com curva flat."""
    tau = maturity - t
    b = (1 - np.exp(-a * tau)) / a
    log_a = -r0 * tau + b * r0 - sigma**2 / (4 * a) * (1 - np.exp(-2 * a * t)) * b**2
    return np.exp(log_a - b * r_t)


def swap_mtm(times: np.ndarray, r: np.ndarray, integral: np.ndarray, notional: float,
             fixed_rate: float, maturity: float, r0: float, a: float, sigma: float,
             receive_fixed: bool) -> np.ndarray:
    """MTM do swap DI × pré em cada data e trajetória.

    Ponta pré: N(1+K)^T trazido a valor presente por P(t, T).
    Ponta CDI: N · exp(∫r) — o CDI já acumulado; o futuro se cancela com o desconto.
    """
    sign = 1.0 if receive_fixed else -1.0
    fixed_final = notional * (1 + fixed_rate) ** maturity
    values = np.empty_like(r)
    for i, t in enumerate(times):
        p = hw_zero_bond(t, maturity, r[:, i], r0, a, sigma)
        values[:, i] = sign * (fixed_final * p - notional * np.exp(integral[:, i]))
    return values


def payment_dates(maturity: float, per_year: int) -> np.ndarray:
    """Datas de pagamento de um swap com fluxos periódicos (0 = bullet, só no vencimento)."""
    if per_year == 0:
        return np.array([maturity])
    n = int(round(maturity * per_year))
    return np.arange(1, n + 1) / per_year


def swap_periodic_mtm(times: np.ndarray, r: np.ndarray, integral: np.ndarray, notional: float,
                      fixed_rate: float, pay: np.ndarray, r0: float, a: float, sigma: float,
                      receive_fixed: bool) -> np.ndarray:
    """MTM de um swap pré × CDI com fluxos periódicos, logo após os pagamentos de cada data.

    Ponta pré: Σ N·[(1+K)^τᵢ − 1]·P(t, Tᵢ) sobre os fluxos que ainda faltam.
    Ponta CDI: N·[e^(∫r desde o último fixing) − P(t, Tₙ)] — o CDI já corrido no período
    corrente mais os períodos futuros, que somados viram 1 − P(t, Tₙ).
    """
    sign = 1.0 if receive_fixed else -1.0
    starts = np.concatenate([[0.0], pay[:-1]])
    coupons = notional * ((1 + fixed_rate) ** (pay - starts) - 1)
    grid_index = {round(float(t), 9): i for i, t in enumerate(times)}
    values = np.empty_like(r)
    for i, t in enumerate(times):
        k = np.searchsorted(pay, t + 1e-9)  # primeiro pagamento ainda por vir
        if k == len(pay):
            values[:, i] = 0.0
            continue
        last_fixing = starts[k] if k > 0 else 0.0
        accrued = np.exp(integral[:, i] - integral[:, grid_index[round(float(last_fixing), 9)]])
        fixed_leg = sum(coupons[j] * hw_zero_bond(t, pay[j], r[:, i], r0, a, sigma) for j in range(k, len(pay)))
        float_leg = notional * (accrued - hw_zero_bond(t, pay[-1], r[:, i], r0, a, sigma))
        values[:, i] = sign * (fixed_leg - float_leg)
    return values


def fixed_rate_sensitivity(notional: float, fixed_rate: float, pay: np.ndarray, r0: float) -> float:
    """∂V/∂K em t = 0 para quem recebe pré: converte um ajuste em R$ num ajuste de taxa."""
    starts = np.concatenate([[0.0], pay[:-1]])
    tau = pay - starts
    return float(notional * np.sum(tau * (1 + fixed_rate) ** (tau - 1) * np.exp(-r0 * pay)))


def initial_margin_periodic(times: np.ndarray, r: np.ndarray, notional: float, fixed_rate: float,
                            pay: np.ndarray, r0: float, a: float, sigma: float) -> np.ndarray:
    """IM paramétrica do swap com fluxos: 99% de 10 dias sobre o delta líquido das duas pontas."""
    starts = np.concatenate([[0.0], pay[:-1]])
    coupons = notional * ((1 + fixed_rate) ** (pay - starts) - 1)
    im = np.zeros_like(r)
    for i, t in enumerate(times):
        k = np.searchsorted(pay, t + 1e-9)
        if k == len(pay):
            continue
        b = lambda T: (1 - np.exp(-a * (T - t))) / a
        fixed_delta = sum(coupons[j] * b(pay[j]) * hw_zero_bond(t, pay[j], r[:, i], r0, a, sigma) for j in range(k, len(pay)))
        float_delta = notional * b(pay[-1]) * hw_zero_bond(t, pay[-1], r[:, i], r0, a, sigma)
        im[:, i] = Z_99 * np.abs(fixed_delta - float_delta) * sigma * sqrt(MARGIN_HORIZON)
    return im


def ndf_mtm(times: np.ndarray, spot: np.ndarray, notional_usd: float, strike: float,
            maturity: float, r_dom: float, r_for: float, long_usd: bool) -> np.ndarray:
    """MTM do NDF: N · [S(t) e^(−r_f (T−t)) − K e^(−r_d (T−t))], com sinal da posição."""
    sign = 1.0 if long_usd else -1.0
    tau = maturity - times
    return sign * notional_usd * (spot * np.exp(-r_for * tau) - strike * np.exp(-r_dom * tau))


def apply_collateral(values: np.ndarray, threshold: float, mpor_steps: int) -> np.ndarray:
    """CSA bilateral: o colateral acompanha o MTM de MPOR passos atrás, acima do threshold H.

    C(t) = sinal · max(|V(t − MPOR)| − H, 0). A exposição que sobra é V(t) − C(t).
    """
    if mpor_steps > 0:
        lagged = np.concatenate([np.zeros((values.shape[0], mpor_steps)), values[:, :-mpor_steps]], axis=1)
    else:
        lagged = values
    collateral = np.sign(lagged) * np.maximum(np.abs(lagged) - threshold, 0.0)
    return values - collateral


def margin_calls(values: np.ndarray, threshold: float, mta: float, rounding: float,
                 independent_amount: float, lag_steps: int) -> dict:
    """Chamadas de margem de um CSA bilateral ao longo de uma trajetória de MTM.

    Em cada dia, o valor de garantia exigido é o MTM (apurado `lag_steps` dias antes) além do
    threshold. A transferência só ocorre se a diferença para o saldo atual for de pelo menos
    o valor mínimo de transferência (MTA), e é arredondada para múltiplos de `rounding`.
    Colateral positivo = recebido pelo banco; negativo = entregue pelo banco.
    """
    n = len(values)
    held = np.zeros(n)
    balance = 0.0
    transfers = []
    for t in range(n):
        observed = values[max(t - lag_steps, 0)] if t >= lag_steps else 0.0
        required = np.sign(observed) * max(abs(observed) - threshold, 0.0)
        delivery = required - balance
        if abs(delivery) >= mta and delivery != 0:
            amount = np.round(delivery / rounding) * rounding if rounding > 0 else delivery
            if amount != 0:
                balance += amount
                transfers.append((t, float(amount)))
        held[t] = balance
    # O valor independente (IA) é depositado pela contraparte no início e não entra nas chamadas
    exposure = np.maximum(values - held - independent_amount, 0.0)
    return {"collateral": held, "exposure": exposure, "transfers": transfers}


def exposure_profile(values: np.ndarray, discount: np.ndarray, quantile: float) -> dict:
    """Perfis de exposição ao longo do tempo, a partir do MTM por trajetória."""
    positive = np.maximum(values, 0.0)
    negative = np.minimum(values, 0.0)
    return {
        "ee": positive.mean(axis=0),                    # exposição esperada
        "ene": negative.mean(axis=0),                   # exposição negativa esperada
        "pfe": np.quantile(positive, quantile, axis=0),  # exposição potencial futura
        "ee_disc": (positive * discount).mean(axis=0),
        "ene_disc": (negative * discount).mean(axis=0),
    }


def epe_and_eepe(times: np.ndarray, ee: np.ndarray) -> tuple[float, float]:
    """EPE: média temporal da EE. EEPE: média, no 1º ano, da EE forçada a não decrescer."""
    epe = float(np.trapezoid(ee, times) / times[-1])
    horizon = times <= min(1.0, times[-1])
    effective_ee = np.maximum.accumulate(ee[horizon])
    t1 = times[horizon]
    eepe = float(np.trapezoid(effective_ee, t1) / t1[-1]) if t1[-1] > 0 else float(ee[0])
    return epe, eepe


def default_probabilities(times: np.ndarray, spread: float, recovery: float) -> np.ndarray:
    """PD marginal em cada intervalo, com intensidade constante λ = spread / (1 − R)."""
    hazard = spread / (1 - recovery)
    survival = np.exp(-hazard * times)
    return survival[:-1] - survival[1:]


def cva(times: np.ndarray, ee_disc: np.ndarray, spread: float, recovery: float) -> tuple[float, np.ndarray]:
    """CVA = (1 − R) Σ EE*(tᵢ) · PD(tᵢ₋₁, tᵢ). Devolve o total e a contribuição de cada intervalo."""
    pd = default_probabilities(times, spread, recovery)
    mid_ee = 0.5 * (ee_disc[1:] + ee_disc[:-1])
    contributions = (1 - recovery) * mid_ee * pd
    return float(contributions.sum()), contributions


def dva(times: np.ndarray, ene_disc: np.ndarray, own_spread: float, own_recovery: float) -> float:
    """DVA: o espelho do CVA, com a exposição negativa e o risco de default do próprio banco."""
    pd = default_probabilities(times, own_spread, own_recovery)
    mid_ene = 0.5 * (ene_disc[1:] + ene_disc[:-1])
    return float(-(1 - own_recovery) * (mid_ene * pd).sum())


def fva(times: np.ndarray, ee_disc: np.ndarray, ene_disc: np.ndarray,
        borrow_spread: float, lend_spread: float) -> tuple[float, float]:
    """FCA: custo de financiar a exposição positiva. FBA: benefício de usar a negativa como funding."""
    dt = np.diff(times)
    fca = borrow_spread * float((0.5 * (ee_disc[1:] + ee_disc[:-1]) * dt).sum())
    fba = -lend_spread * float((0.5 * (ene_disc[1:] + ene_disc[:-1]) * dt).sum())
    return fca, fba


def initial_margin_swap(times: np.ndarray, r: np.ndarray, notional: float, fixed_rate: float,
                        maturity: float, r0: float, a: float, sigma: float) -> np.ndarray:
    """Margem inicial paramétrica: 99% de um choque de 10 dias na taxa curta sobre o delta da ponta pré."""
    fixed_final = notional * (1 + fixed_rate) ** maturity
    im = np.empty_like(r)
    for i, t in enumerate(times):
        b = (1 - np.exp(-a * (maturity - t))) / a
        delta = fixed_final * b * hw_zero_bond(t, maturity, r[:, i], r0, a, sigma)  # |∂V/∂r|
        im[:, i] = Z_99 * delta * sigma * sqrt(MARGIN_HORIZON)
    return im


def initial_margin_ndf(times: np.ndarray, spot: np.ndarray, notional_usd: float,
                       maturity: float, r_for: float, sigma: float) -> np.ndarray:
    """Margem inicial paramétrica: 99% de um choque de 10 dias no câmbio sobre o delta do NDF."""
    delta = notional_usd * spot * np.exp(-r_for * (maturity - times))
    return Z_99 * delta * sigma * sqrt(MARGIN_HORIZON)


def mva(times: np.ndarray, im: np.ndarray, discount: np.ndarray, funding_spread: float) -> float:
    """MVA = s_f Σ E[IM(t) · D(0, t)] Δt: o custo de financiar a margem inicial depositada."""
    expected = (im * discount).mean(axis=0)
    dt = np.diff(times)
    return funding_spread * float((0.5 * (expected[1:] + expected[:-1]) * dt).sum())


def to_continuous(rate_252: float) -> float:
    """Converte taxa exponencial base 252 (convenção brasileira) para contínua."""
    return float(np.log1p(rate_252))


def _downsample(times: np.ndarray, max_points: int = 120) -> np.ndarray:
    step = max(1, int(np.ceil(len(times) / max_points)))
    idx = np.arange(0, len(times), step)
    return idx if idx[-1] == len(times) - 1 else np.append(idx, len(times) - 1)


def model_paths(model: str, params: dict, n_paths: int, seed: int) -> dict:
    """Trajetórias, faixas de percentis e checagens contra valores analíticos (página de Monte Carlo)."""
    times = time_grid(params["maturity"])
    if model == "gbm":
        paths = simulate_gbm(params["s0"], params["drift"], params["sigma"], times, n_paths, seed)
        analytic = params["s0"] * np.exp(params["drift"] * times[-1])
        estimates = paths[:, -1]
        check = "E[S(T)] = S₀·e^(μT)"
    else:
        r0 = to_continuous(params["r0"])
        paths, integral = simulate_hull_white(r0, params["a"], params["sigma"], times, n_paths, seed)
        analytic = float(np.exp(-r0 * times[-1]))  # P(0, T) da curva inicial
        estimates = np.exp(-integral[:, -1])
        check = "E[e^(−∫r ds)] = P(0, T)"

    idx = _downsample(times)
    bands = np.percentile(paths[:, idx], [5, 25, 50, 75, 95], axis=0)
    convergence = []
    for n in (100, 1_000, 10_000, n_paths):
        n = min(n, n_paths)
        sample = estimates[:n]
        convergence.append({"n": n, "estimate": float(sample.mean()),
                            "std_error": float(sample.std(ddof=1) / sqrt(n))})
    return {
        "times": times[idx].tolist(),
        "samples": paths[:12][:, idx].tolist(),
        "bands": {k: bands[i].tolist() for i, k in enumerate(["p5", "p25", "p50", "p75", "p95"])},
        "check": {"label": check, "analytic": float(analytic), "convergence": convergence},
    }


def xva_run(p: dict) -> dict:
    """Simula o instrumento, aplica o colateral e calcula exposições, CVA, DVA, FVA e MVA."""
    times = time_grid(p["maturity"])
    mpor_steps = int(round(p["mpor_days"] / 5))  # passos semanais de 5 dias úteis
    if p["instrument"] == "swap":
        r0 = to_continuous(p["rate"])
        r, integral = simulate_hull_white(r0, p["hw_a"], p["hw_sigma"], times, p["n_paths"], p["seed"])
        values = swap_mtm(times, r, integral, p["notional"], p["fixed_rate"], p["maturity"],
                          r0, p["hw_a"], p["hw_sigma"], p["receive"])
        discount = np.exp(-integral)
        im = initial_margin_swap(times, r, p["notional"], p["fixed_rate"], p["maturity"],
                                 r0, p["hw_a"], p["hw_sigma"])
    else:
        r_dom, r_for = to_continuous(p["rate"]), to_continuous(p["foreign_rate"])
        spot = simulate_gbm(p["spot"], r_dom - r_for, p["fx_vol"], times, p["n_paths"], p["seed"])
        # Sem strike informado, contrata-se a termo de mercado: MTM inicial zero
        strike = p["strike"] or p["spot"] * np.exp((r_dom - r_for) * p["maturity"])
        values = ndf_mtm(times, spot, p["notional"], strike, p["maturity"], r_dom, r_for, p["receive"])
        discount = np.exp(-r_dom * times)[None, :]
        im = initial_margin_ndf(times, spot, p["notional"], p["maturity"], r_for, p["fx_vol"])

    uncollateralized = exposure_profile(values, discount, p["pfe_quantile"])
    exposed = apply_collateral(values, p["threshold"], mpor_steps) if p["collateral"] else values
    prof = exposure_profile(exposed, discount, p["pfe_quantile"])
    epe, eepe = epe_and_eepe(times, prof["ee"])
    cva_total, cva_buckets = cva(times, prof["ee_disc"], p["cpty_spread"], p["cpty_recovery"])
    dva_total = dva(times, prof["ene_disc"], p["own_spread"], p["own_recovery"])
    fca, fba = fva(times, prof["ee_disc"], prof["ene_disc"], p["funding_spread"], p["lend_spread"])
    mva_total = mva(times, im, discount, p["funding_spread"]) if p["initial_margin"] else 0.0

    idx = _downsample(times)
    return {
        "mtm0": float(values[:, 0].mean()),
        "profile": [{
            "t": float(times[i]), "ee": float(prof["ee"][i]), "ene": float(prof["ene"][i]),
            "pfe": float(prof["pfe"][i]), "ee_uncoll": float(uncollateralized["ee"][i]),
            "pfe_uncoll": float(uncollateralized["pfe"][i]), "im": float(im[:, i].mean()),
        } for i in idx],
        "samples": values[:10][:, idx].tolist(),
        "metrics": {
            "epe": epe, "eepe": eepe, "max_pfe": float(prof["pfe"].max()),
            "cva": cva_total, "dva": dva_total, "fca": fca, "fba": fba, "fva": fca - fba,
            "mva": mva_total, "total": cva_total - dva_total + fca - fba + mva_total,
        },
        "cva_buckets": [{"t": float(times[i + 1]), "cva": float(c)} for i, c in enumerate(cva_buckets)],
    }


def csa_run(p: dict) -> dict:
    """Uma trajetória diária do swap DI × pré e as chamadas de margem do CSA sobre ela."""
    times = time_grid(p["horizon"], steps_per_year=252)
    r0 = to_continuous(p["rate"])
    r, integral = simulate_hull_white(r0, p["hw_a"], p["hw_sigma"], times, 1, p["seed"])
    values = swap_mtm(times, r, integral, p["notional"], p["fixed_rate"], p["maturity"],
                      r0, p["hw_a"], p["hw_sigma"], p["receive"])[0]
    csa = margin_calls(values, p["threshold"], p["mta"], p["rounding"],
                       p["independent_amount"], p["lag_days"])
    uncollateralized = np.maximum(values, 0.0)
    return {
        "series": [{"t": float(t), "mtm": float(v), "collateral": float(c), "exposure": float(e)}
                   for t, v, c, e in zip(times, values, csa["collateral"], csa["exposure"])],
        "transfers": [{"t": float(times[i]), "amount": a} for i, a in csa["transfers"]],
        "summary": {
            "n_transfers": len(csa["transfers"]),
            "max_exposure_uncoll": float(uncollateralized.max()),
            "max_exposure": float(csa["exposure"].max()),
            "avg_exposure_uncoll": float(uncollateralized.mean()),
            "avg_exposure": float(csa["exposure"].mean()),
        },
    }


def _swap_scenarios(p: dict, steps_per_year: int):
    """Simula o Hull-White e o MTM do swap a par com fluxos periódicos (ou bullet)."""
    times = time_grid(p["maturity"], steps_per_year)
    r0 = to_continuous(p["rate"])
    r, integral = simulate_hull_white(r0, p["hw_a"], p["hw_sigma"], times, p["n_paths"], p["seed"])
    pay = payment_dates(p["maturity"], p["per_year"])
    values = swap_periodic_mtm(times, r, integral, p["notional"], p["rate"], pay,
                               r0, p["hw_a"], p["hw_sigma"], p["receive"])
    return times, r, integral, pay, r0, values


def quote_run(p: dict) -> dict:
    """Cotação de um swap a par sem CSA e com CSA: XVA em R$ e em bps sobre a taxa pré.

    Sem CSA: CVA, DVA e FVA sobre a exposição cheia. Com CSA (margem de variação em caixa,
    remunerada ao CDI): CVA e DVA residuais do MPOR, sem FVA, e MVA se houver margem inicial.
    """
    times, r, integral, pay, r0, values = _swap_scenarios(p, 52)
    discount = np.exp(-integral)
    mpor_steps = int(round(p["mpor_days"] / 5))
    sensitivity = fixed_rate_sensitivity(p["notional"], p["rate"], pay, r0)

    def adjustments(exposed: np.ndarray, with_csa: bool) -> dict:
        prof = exposure_profile(exposed, discount, 0.975)
        cva_total, _ = cva(times, prof["ee_disc"], p["cpty_spread"], p["cpty_recovery"])
        dva_total = dva(times, prof["ene_disc"], p["own_spread"], p["own_recovery"])
        fca, fba = (0.0, 0.0) if with_csa else fva(times, prof["ee_disc"], prof["ene_disc"],
                                                     p["funding_spread"], p["lend_spread"])
        mva_total = 0.0
        if with_csa and p["initial_margin"]:
            im = initial_margin_periodic(times, r, p["notional"], p["rate"], pay, r0, p["hw_a"], p["hw_sigma"])
            mva_total = mva(times, im, discount, p["funding_spread"])
        total = cva_total - dva_total + fca - fba + mva_total
        bps = total / sensitivity * 10_000
        # Quem recebe pré cobra uma taxa maior; quem paga pré oferece uma taxa menor
        quote = p["rate"] + (bps if p["receive"] else -bps) / 10_000
        return {"cva": cva_total, "dva": dva_total, "fca": fca, "fba": fba, "mva": mva_total,
                "total": total, "bps": bps, "quote": quote, "ee": prof["ee"], "pfe": prof["pfe"]}

    no_csa = adjustments(values, False)
    with_csa = adjustments(apply_collateral(values, p["threshold"], mpor_steps), True)
    idx = _downsample(times)
    return {
        "par_rate": p["rate"],
        "sensitivity": sensitivity,
        "payments": len(pay),
        "no_csa": {k: v for k, v in no_csa.items() if k not in ("ee", "pfe")},
        "with_csa": {k: v for k, v in with_csa.items() if k not in ("ee", "pfe")},
        "profile": [{"t": float(times[i]), "ee_no_csa": float(no_csa["ee"][i]), "ee_csa": float(with_csa["ee"][i]),
                     "pfe_no_csa": float(no_csa["pfe"][i]), "pfe_csa": float(with_csa["pfe"][i])} for i in idx],
    }


def lookback_index(day: int, mpor_days: int, call_every: int, grid_step: int, rounding: str) -> int | None:
    """Data (em dias) da última chamada de margem bem-sucedida antes de um default em `day`.

    A última chamada é a data de verificação mais recente até `day − MPOR`. Numa grade de
    simulação com passo `grid_step`, essa data pode não existir: é preciso arredondar para a
    data mais próxima ou para a anterior da grade.
    """
    if day - mpor_days < 0:
        return None
    last_call = ((day - mpor_days) // call_every) * call_every
    snapped = round(last_call / grid_step) * grid_step if rounding == "nearest" else (last_call // grid_step) * grid_step
    return min(snapped, day)


def margin_grid_run(p: dict) -> dict:
    """EPE e CVA para cada combinação de passo de simulação × frequência de verificação do CSA."""
    times, r, integral, pay, r0, values = _swap_scenarios(p, 252)
    discount = np.exp(-integral)
    n_days = len(times) - 1
    grids = {"Diário": 1, "Semanal": 5, "Quinzenal": 10, "Mensal": 21}
    frequencies = {"Diária": 1, "Semanal": 5, "Quinzenal": 10, "Mensal": 21, "Sem CSA": None}

    def exposure_on_grid(step: int, call_every: int | None) -> tuple[np.ndarray, np.ndarray]:
        days = np.arange(0, n_days + 1, step)
        if days[-1] != n_days:
            days = np.append(days, n_days)
        v = values[:, days]
        if call_every is not None:
            collateral = np.zeros_like(v)
            for j, d in enumerate(days):
                lb = lookback_index(int(d), p["mpor_days"], call_every, step, p["rounding"])
                if lb is not None:
                    seen = values[:, lb]
                    collateral[:, j] = np.sign(seen) * np.maximum(np.abs(seen) - p["threshold"], 0.0)
            v = v - collateral
        return days, v

    matrix, profiles = [], {}
    for grid_name, step in grids.items():
        row = {"grid": grid_name, "cells": []}
        for freq_name, call_every in frequencies.items():
            days, v = exposure_on_grid(step, call_every)
            t = times[days]
            prof = exposure_profile(v, discount[:, days], 0.975)
            cva_total, _ = cva(t, prof["ee_disc"], p["cpty_spread"], p["cpty_recovery"])
            epe = float(np.trapezoid(prof["ee"], t) / t[-1])
            row["cells"].append({"freq": freq_name, "epe": epe, "cva": cva_total})
            if freq_name == p["profile_freq"]:
                idx = _downsample(t, 150)
                profiles[grid_name] = [{"t": float(t[i]), "ee": float(prof["ee"][i])} for i in idx]
        matrix.append(row)
    return {"frequencies": list(frequencies), "matrix": matrix, "profiles": profiles}
