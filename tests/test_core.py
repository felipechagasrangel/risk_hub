from math import exp, isclose

import numpy as np

from backend.core import capital, capital_structure, credit_loss, curves, irrbb_behavioral, liquidity_mgmt, saccr, irrbb, liquidity, market, rwa_sens, sensitivities, stress, valuation, xva


def test_parametric_var_matches_textbook():
    var, es = market.parametric_var(1_000_000, 0.0, 0.01, 0.99, 1)
    assert isclose(var, 23_263.5, rel_tol=1e-4)
    assert isclose(es, 26_652.1, rel_tol=1e-4)  # ES 99% normal = 2,6652σ


def test_var_scales_with_square_root_of_time():
    v1, _ = market.parametric_var(1.0, 0.0, 0.01, 0.99, 1)
    v10, _ = market.parametric_var(1.0, 0.0, 0.01, 0.99, 10)
    assert isclose(v10 / v1, 10**0.5)


def test_portfolio_component_var_sums_to_diversified():
    r = market.portfolio_var([100, 200], [0.2, 0.3], [[1, 0.3], [0.3, 1]], 0.99, 1)
    assert isclose(sum(r["component_var"]), r["diversified_var"])
    assert r["diversified_var"] < r["undiversified_var"]


def test_irb_corporate_risk_weight_reference_value():
    # Basileia: PD 1%, LGD 45%, M 2,5 → FPR ≈ 92,3%
    r = capital.irb_capital(0.01, 0.45, 2.5, "corporate")
    assert isclose(r["risk_weight"], 0.9232, abs_tol=5e-4)


def test_lcr_applies_haircuts_caps_and_inflow_cap():
    stock = liquidity.hqla_stock([
        {"amount": 100, "level": "1"},
        {"amount": 200, "level": "2B"},  # 100 após haircut, bem acima do limite de 15%
    ])
    assert stock["total"] < 100 + 100
    r = liquidity.lcr([{"amount": 100, "level": "1"}],
                      [{"amount": 100, "rate": 1.0}],
                      [{"amount": 100, "rate": 1.0}])
    assert isclose(r["net_outflows"], 25)
    assert isclose(r["lcr"], 4)


def test_irrbb_long_fixed_asset_loses_eve_when_rates_rise():
    positions = [
        {"side": "asset", "amount": 100, "rate": 0.10, "repricing": 10},
        {"side": "liability", "amount": 90, "rate": 0.10, "repricing": 0.25},
    ]
    curve = [{"tenor": 1, "rate": 0.10}, {"tenor": 10, "rate": 0.10}]
    shocks = {"parallel": 0.02, "short": 0.03, "long": 0.015}
    res = irrbb.analyze(positions, curve, shocks, tier1=10)
    by = {s["scenario"]: s for s in res["scenarios"]}
    assert by["parallel_up"]["delta_eve"] < 0 < by["parallel_down"]["delta_eve"]
    # passivo reprecifica em 3 meses: paga 2% a mais por 9 meses
    assert isclose(by["parallel_up"]["delta_nii"], -90 * 0.02 * 0.75)


def test_stress_rates_position_uses_duration_and_convexity():
    p = {"factor": "rates", "value": 1000, "duration": 4, "convexity": 20}
    pnl = stress.position_pnl(p, {"equity": 0, "fx": 0, "rates": 0.01})
    assert isclose(pnl, 1000 * (-0.04 + 0.5 * 20 * 0.0001))


def test_stress_reverse_multiplier_reaches_loss_limit():
    positions = [{"name": "Ações", "factor": "equity", "value": 1000, "vol_annual": 0.25,
                  "duration": 0, "convexity": 0}]
    rho = {"equity_fx": 0, "equity_rates": 0, "fx_rates": 0}
    res = stress.run(positions, rho, 0.99, loss_limit=200,
                     custom={"equity": -0.10, "fx": 0, "rates": 0})
    custom = next(s for s in res["scenarios"] if s["key"] == "custom")
    assert isclose(custom["total_pnl"], -100)
    assert isclose(custom["reverse_multiplier"], 2)


def test_girr_annex_vii_matches_basel_formula():
    # Anexo VII = max(exp(−3% × |Tk − Tl| / min(Tk, Tl)), 40%), com vértices em anos
    years = [du / 252 for du in rwa_sens.VERTICES_DU]
    for i in range(1, len(years)):
        for j in range(1, len(years)):
            tk, tl = years[i], years[j]
            expected = max(exp(-0.03 * abs(tk - tl) / min(tk, tl)), 0.4)
            assert abs(rwa_sens.vertex_correlation(i, j) - expected) < 6e-4


def test_girr_single_sensitivity_is_dv01_times_shock():
    # DV01 de −1.000 no vértice de 5 anos (1.260 DU), BRL sem grau de investimento: RW = 2,6%
    dv01 = [0.0] * 11
    dv01[6] = -1000
    res = rwa_sens.girr_delta([{"name": "Pré", "currency": "BRL", "settlement": "BRL", "dv01": dv01}],
                              brazil_investment_grade=False)
    assert isclose(res["requirement"], 1000 * 260)  # perda de um choque de 260 bps
    assert isclose(res["rwa"], 1000 * 260 / 0.08)


def test_girr_hedge_between_vertices_is_binding_in_low_correlation():
    dv01 = [0.0] * 11
    dv01[4], dv01[6] = -1000, 1000  # comprado em 2 anos, vendido em 5 anos
    res = rwa_sens.girr_delta([{"name": "Pré", "currency": "BRL", "settlement": "BRL", "dv01": dv01}], False)
    assert res["binding_scenario"] == "low"


def test_girr_category_factor_depends_on_settlement_currency():
    assert rwa_sens.category_factor("USD", "USD", False) == 0.7071
    assert rwa_sens.category_factor("USD", "BRL", False) == 1.0  # cupom cambial
    assert rwa_sens.category_factor("BRL", "BRL", True) == 0.7071


DI_CALL = {"name": "Call", "curve": "Pré", "kind": "call", "quantity": 1, "strike": 0.145,
           "rate": 0.14, "vol": 0.02, "expiry_du": 252, "underlying_du": 504}


def test_di_option_put_call_parity():
    # call − put = PU(K) − E[PU(r_T)] (forward do PU), independentemente da volatilidade
    put = {**DI_CALL, "kind": "put"}
    lhs = rwa_sens.di_option_value(DI_CALL) - rwa_sens.di_option_value(put)
    r_t = 0.14 + 0.02 * rwa_sens._GH_X
    forward = float((rwa_sens._GH_W * rwa_sens.di1_pu(r_t, 252)).sum())
    assert isclose(lhs, rwa_sens.di1_pu(0.145, 252) - forward, rel_tol=1e-9)


def test_curvature_long_option_needs_no_capital_and_short_does():
    long_up, long_down = rwa_sens.cvr(DI_CALL)
    assert long_up < 0 and long_down < 0  # comprado em convexidade: ganha além do linear
    short = {**DI_CALL, "quantity": -1}
    res = rwa_sens.compute([], [short], [], False)
    assert res["curvature"]["scenarios"]["medium"] > 0
    long_res = rwa_sens.compute([], [DI_CALL], [], False)
    assert long_res["curvature"]["scenarios"]["medium"] == 0


def test_option_delta_merges_into_named_curve():
    dv01 = [0.0] * 11
    curves = [{"name": "Pré", "currency": "BRL", "settlement": "BRL", "dv01": dv01}]
    res = rwa_sens.compute(curves, [DI_CALL], [], False)
    assert len(res["curves"]) == 1
    ws_2y = res["curves"][0]["weighted_sensitivities"][4]
    assert isclose(ws_2y, rwa_sens.option_dv01(DI_CALL) / 0.0001 * 0.028)


def test_fx_delta_single_currency_is_15_percent_of_exposure():
    res = rwa_sens.fx_delta([{"currency": "USD", "exposure": 1_000_000}])
    assert all(isclose(v, 150_000) for v in res["scenarios"].values())


def test_fx_delta_opposite_positions_bind_in_low_correlation():
    res = rwa_sens.fx_delta([{"currency": "USD", "exposure": 1_000_000},
                             {"currency": "EUR", "exposure": -1_000_000}])
    sc = res["scenarios"]
    # sqrt(2 × 150k² × (1 − γ)): menor γ, maior requerimento
    assert isclose(sc["medium"], 150_000 * (2 * (1 - 0.60)) ** 0.5)
    assert sc["low"] > sc["medium"] > sc["high"]


def test_compute_sums_fx_delta_into_totals():
    fx = [{"currency": "USD", "exposure": 1_000_000}]
    res = rwa_sens.compute([], [], fx, False)
    assert isclose(res["totals"]["medium"], 150_000)


def test_accrual_and_mtm_converge_at_maturity():
    r = valuation.bond_paths(1000, 2, 0.12, 0.15, 0.5, 1)
    last = r["path"][-1]
    assert isclose(last["accrual"], 1000) and isclose(last["mtm"], 1000)


def test_rate_rise_creates_unrealized_loss_split_by_category():
    r = valuation.bond_paths(1000, 2, 0.12, 0.15, 0.5, 1)
    today, cats = r["today"], r["today"]["categories"]
    assert today["unrealized"] < 0
    # VJORA: juros no resultado, marcação no PL; VJR: tudo no resultado
    assert isclose(cats["fvoci"]["income"], cats["amortized_cost"]["income"])
    assert isclose(cats["fvoci"]["oci"], today["unrealized"])
    assert isclose(cats["fvtpl"]["income"], cats["fvoci"]["income"] + cats["fvoci"]["oci"])


def test_floating_note_only_marks_spread_changes():
    same = valuation.floating_note(1000, 756, 252, 0.14, 0.01, 0.01)
    assert isclose(same["mtm"], same["curve"])
    wider = valuation.floating_note(1000, 756, 252, 0.14, 0.01, 0.015)
    assert wider["unrealized"] < 0  # spread de mercado maior: o papel vale menos


def test_swap_cdi_leg_has_no_marking_and_fixed_leg_carries_it():
    s = valuation.swap_di_pre(1000, 504, 126, 0.13, 0.14, 0.13, receive_fixed=True)
    assert isclose(s["legs"]["cdi"]["curve"], s["legs"]["cdi"]["mtm"])
    assert isclose(s["value_mtm"], s["value_curve"])  # taxa de mercado = contratada
    up = valuation.swap_di_pre(1000, 504, 126, 0.13, 0.14, 0.15, receive_fixed=True)
    assert up["unrealized"] < 0 and up["dv01"] < 0  # recebe pré: perde com alta de juros
    payer = valuation.swap_di_pre(1000, 504, 126, 0.13, 0.14, 0.15, receive_fixed=False)
    assert isclose(payer["value_mtm"], -up["value_mtm"])


def test_gbm_mean_matches_analytic():
    times = xva.time_grid(2)
    paths = xva.simulate_gbm(100, 0.05, 0.2, times, 20_000, 1)
    assert isclose(paths[:, -1].mean(), 100 * exp(0.05 * 2), rel_tol=0.01)


def test_hull_white_reprices_initial_curve():
    times = xva.time_grid(5)
    r, integral = xva.simulate_hull_white(0.12, 0.15, 0.02, times, 20_000, 2)
    assert isclose(np.exp(-integral[:, -1]).mean(), exp(-0.12 * 5), rel_tol=0.005)
    # o zero-cupom do modelo em t = 0 é a curva inicial
    assert isclose(float(xva.hw_zero_bond(0, 5, 0.12, 0.12, 0.15, 0.02)), exp(-0.12 * 5))


def test_par_swap_starts_near_zero_and_collateral_cuts_exposure():
    base = {"instrument": "swap", "receive": True, "notional": 1e6, "maturity": 3, "rate": 0.14,
            "fixed_rate": 0.14, "hw_a": 0.15, "hw_sigma": 0.02, "spot": 5, "strike": 5,
            "foreign_rate": 0.04, "fx_vol": 0.15, "pfe_quantile": 0.975, "collateral": False,
            "threshold": 0, "mpor_days": 10, "cpty_spread": 0.02, "cpty_recovery": 0.4,
            "own_spread": 0.01, "own_recovery": 0.4, "funding_spread": 0.01, "lend_spread": 0.003,
            "initial_margin": True,
            "n_paths": 3000, "seed": 3}
    res = xva.xva_run(base)
    assert abs(res["mtm0"]) < 1e-6 * 1e6
    assert res["metrics"]["cva"] > 0 and res["metrics"]["mva"] > 0
    coll = xva.xva_run({**base, "collateral": True})
    assert coll["metrics"]["cva"] < 0.5 * res["metrics"]["cva"]


def test_cva_with_flat_exposure_matches_closed_form():
    times = xva.time_grid(2)
    ee = np.full(len(times), 100.0)
    total, _ = xva.cva(times, ee, spread=0.03, recovery=0.4)
    assert isclose(total, 0.6 * 100 * (1 - exp(-0.05 * 2)))  # λ = 3% / 60% = 5%


def test_margin_calls_respect_threshold_mta_and_rounding():
    values = np.array([0, 400, 1200, 1350, 2000, 900, -1500.0])
    out = xva.margin_calls(values, threshold=500, mta=200, rounding=100, independent_amount=0, lag_steps=0)
    held = out["collateral"]
    assert held[1] == 0                      # abaixo do threshold: nada
    assert held[2] == 700                    # 1200 − 500
    assert held[3] == 700                    # faltariam 150 < MTA: sem chamada
    assert held[4] == 1500                   # 2000 − 500
    assert held[6] == -1000                  # banco passa a entregar: −1500 + 500
    assert all(abs(a) % 100 == 0 for _, a in out["transfers"])
    # exposição residual nunca passa de threshold + MTA quando não há atraso
    assert out["exposure"].max() <= 500 + 200


def test_periodic_swap_is_at_par_and_bullet_matches_before_maturity():
    times = xva.time_grid(3, 52)
    r0 = xva.to_continuous(0.14)
    r, integral = xva.simulate_hull_white(r0, 0.15, 0.02, times, 400, 1)
    bullet_old = xva.swap_mtm(times, r, integral, 1e6, 0.14, 3, r0, 0.15, 0.02, True)
    bullet_new = xva.swap_periodic_mtm(times, r, integral, 1e6, 0.14, xva.payment_dates(3, 0), r0, 0.15, 0.02, True)
    # iguais até a véspera; no vencimento a nova convenção já descontou o fluxo pago
    assert np.allclose(bullet_old[:, :-1], bullet_new[:, :-1])
    semi = xva.swap_periodic_mtm(times, r, integral, 1e6, 0.14, xva.payment_dates(3, 2), r0, 0.15, 0.02, True)
    assert abs(semi[:, 0].mean()) < 1e-6  # taxa de mercado = taxa par


def test_lookback_rounding_on_coarse_grid():
    # Grade diária: a última chamada (diária) antes de um default no dia 100 com MPOR 10 é o dia 90
    assert xva.lookback_index(100, 10, 1, 1, "nearest") == 90
    # Grade mensal (21 dias), dia 105: dia 95 arredonda para 105 (o próprio dia: sem atraso!) ou 84
    assert xva.lookback_index(105, 10, 1, 21, "nearest") == 105
    assert xva.lookback_index(105, 10, 1, 21, "floor") == 84
    assert xva.lookback_index(5, 10, 1, 1, "nearest") is None


def test_quote_with_csa_is_tighter_than_without():
    p = dict(notional=1e7, maturity=3, per_year=2, rate=0.14, hw_a=0.15, hw_sigma=0.02, receive=True,
             cpty_spread=0.02, cpty_recovery=0.4, own_spread=0.01, own_recovery=0.4, funding_spread=0.01,
             lend_spread=0.003, threshold=0, mpor_days=10, initial_margin=False, n_paths=1500, seed=3)
    q = xva.quote_run(p)
    assert q["with_csa"]["cva"] < q["no_csa"]["cva"]
    assert q["with_csa"]["fca"] == 0
    assert q["no_csa"]["quote"] > q["with_csa"]["quote"] > q["par_rate"] - 1e-4


MKT = sensitivities.flat_market(pre=0.14, cupom=0.05, ipca=0.07, spot=5.4, vol=0.15)


def test_ltn_key_rate_dv01_sits_on_its_vertex_and_matches_duration():
    pos = sensitivities.default_positions("ltn", 1e6, 2.0, MKT)
    dv01 = sensitivities.key_rate_dv01(pos, MKT)["pre"]
    k = list(sensitivities.VERTICES).index(2.0)
    assert all(abs(v) < 1e-9 for i, v in enumerate(dv01) if i != k)
    pv = sensitivities.portfolio_value(pos, MKT)
    assert isclose(dv01[k], -2.0 * pv / 1.14 * 1e-4, rel_tol=1e-3)  # duration modificada × PV × 1 bp


def test_derivatives_start_at_zero_and_ndf_has_three_factors():
    for kind in ("swap_fx", "ndf"):
        pos = sensitivities.default_positions(kind, 1e7, 2.0, MKT)
        assert abs(sensitivities.portfolio_value(pos, MKT)) < 1e-6
    ndf = sensitivities.default_positions("ndf", 1e7, 2.0, MKT)
    dv01 = sensitivities.key_rate_dv01(ndf, MKT)
    assert sum(dv01["pre"]) > 0 > sum(dv01["cupom"])  # comprado em dólar a termo
    greeks = sensitivities.fx_and_vol_greeks(ndf, MKT)
    usd = ndf[0]["notional"]
    assert isclose(greeks["delta_fx"], usd * 5.4 * 0.01 * sensitivities.df_cupom(MKT, 2.0), rel_tol=1e-9)
    assert abs(greeks["gamma_fx"]) < 1e-6 and abs(greeks["vega"]) < 1e-9


def test_swap_fx_has_no_pre_risk():
    pos = sensitivities.default_positions("swap_fx", 1e7, 3.0, MKT)
    dv01 = sensitivities.key_rate_dv01(pos, MKT)
    assert all(abs(v) < 1e-6 for v in dv01["pre"])
    assert sum(dv01["cupom"]) < 0


def test_call_greeks_and_pnl_explain_convexity():
    call = sensitivities.default_positions("call_fx", 1e7, 1.0, MKT)
    g = sensitivities.fx_and_vol_greeks(call, MKT)
    ndf = sensitivities.fx_and_vol_greeks(sensitivities.default_positions("ndf", 1e7, 1.0, MKT), MKT)
    assert 0 < g["delta_fx"] < ndf["delta_fx"] and g["gamma_fx"] > 0 and g["vega"] > 0
    ltn = sensitivities.default_positions("ltn", 1e6, 5.0, MKT)
    shocks = {"pre": 300, "cupom": 0, "ipca": 0, "fx_pct": 0, "vol_pts": 0}
    res = sensitivities.pnl_explain(ltn, MKT, shocks)
    assert res["full"] < 0 and res["unexplained"] > 0  # convexidade: perde menos que o linear


DU = np.array([1, 44, 105, 168, 296, 547.0])
RATES = np.array([0.149, 0.1485, 0.147, 0.1445, 0.141, 0.137])


def test_flat_forward_hits_nodes_and_keeps_forward_constant():
    for d, r in zip(DU, RATES):
        assert isclose(curves.flat_forward(DU, RATES, d), r, rel_tol=1e-12)
    # entre dois vértices, o termo de qualquer subintervalo é o mesmo
    f_a = curves.forward_rate(curves.flat_forward(DU, RATES, 110), 110, curves.flat_forward(DU, RATES, 120), 120)
    f_b = curves.forward_rate(curves.flat_forward(DU, RATES, 150), 150, curves.flat_forward(DU, RATES, 160), 160)
    assert isclose(f_a, f_b, rel_tol=1e-10)
    assert isclose(f_a, curves.forward_rate(RATES[2], 105, RATES[3], 168), rel_tol=1e-10)


def test_spline_passes_through_nodes():
    s = curves.natural_spline(DU, RATES)
    assert all(isclose(s(d), r, abs_tol=1e-12) for d, r in zip(DU, RATES))


def test_di1_pu_and_implied_cupom_round_trip():
    assert isclose(curves.di1_pu(0.14, 252), 100_000 / 1.14)
    pre, du, dc, cupom, spot = 0.145, 168, 246, 0.051, 5.40
    future = spot * (1 + pre) ** (du / 252) / (1 + cupom * dc / 360)
    assert isclose(curves.implied_cupom(spot, future, pre, du, dc), cupom, rel_tol=1e-12)


def test_stage_rules_follow_days_and_pd_deterioration():
    assert credit_loss.stage(0, 0.04, 0.04, 2.5) == 1
    assert credit_loss.stage(30, 0.04, 0.04, 2.5) == 1
    assert credit_loss.stage(31, 0.04, 0.04, 2.5) == 2       # presunção de 30 dias
    assert credit_loss.stage(0, 0.10, 0.04, 2.5) == 2        # PD 2,5× maior
    assert credit_loss.stage(91, 0.04, 0.04, 2.5) == 3       # problema de recuperação
    assert credit_loss.stage(0, 0.04, 0.04, 2.5, problem_signal=True) == 3


def test_expected_loss_bullet_matches_closed_form_and_lifetime_exceeds_12m():
    ead = credit_loss.exposure_schedule(1000, 12, 0.0, amortizing=False)
    assert isclose(credit_loss.expected_loss(ead, 0.05, 0.5, 0.0, 12), 1000 * 0.5 * 0.05)
    ead = credit_loss.exposure_schedule(1000, 60, 0.2, amortizing=True)
    assert credit_loss.expected_loss(ead, 0.05, 0.5, 0.2, 60) > credit_loss.expected_loss(ead, 0.05, 0.5, 0.2, 12)


def test_incurred_loss_floor_annex_i():
    assert credit_loss.incurred_loss_floor("C5", 90) == 0
    assert credit_loss.incurred_loss_floor("C5", 91) == 0.50     # menos de 1 mês de inadimplência
    assert credit_loss.incurred_loss_floor("C1", 125) == 0.10    # 1 a 2 meses
    assert credit_loss.incurred_loss_floor("C3", 2000) == 1.0    # topo da tabela


def test_provision_is_max_of_ecl_and_floor_in_stage_3():
    p = dict(balance=1000, remaining_months=24, rate=0.2, amortizing=True, portfolio="C1", pd_origination=0.03,
             pd_now=0.03, lgd=0.2, sicr_multiple=2.5, problem_signal=False,
             scenarios=[{"name": "Base", "weight": 1, "pd_multiplier": 1}])
    early = credit_loss.provision(p, 100)    # C1 < 1 mês: piso 5,5% < LGD 20% → vale a ECL
    assert early["stage"] == 3 and isclose(early["provision"], 200)
    late = credit_loss.provision(p, 400)     # ~10 meses: piso 50,5% > 20% → vale o piso
    assert isclose(late["provision"], late["floor"]) and late["floor"] > late["ecl"]


def test_saccr_supervisory_parameters():
    assert isclose(saccr.supervisory_duration(0, 5), (1 - exp(-0.25)) / 0.05)
    assert saccr.maturity_factor(3, False, 10) == 1.0                       # sem margem: limitado a 1 ano
    assert isclose(saccr.maturity_factor(0.25, False, 10), 0.5)
    assert isclose(saccr.maturity_factor(3, True, 10), 1.5 * (10 / 250) ** 0.5)  # com margem: MPOR
    call = {"kind": "fx_option", "long": True, "option": "call", "moneyness": 1.0, "end": 1.0}
    assert 0.5 < saccr.supervisory_delta(call) < 0.56                          # ATM: um pouco acima de 0,5
    assert isclose(saccr.supervisory_delta({**call, "long": False}), -saccr.supervisory_delta(call))


def test_saccr_single_swap_matches_hand_calculation():
    swap = {"name": "s", "kind": "ir_swap", "notional": 1e6, "start": 0, "end": 5, "long": True, "mtm": 0,
            "currency": "BRL", "pair": "", "option": "call", "moneyness": 1}
    netting = {"margined": False, "collateral": 0, "threshold": 0, "mta": 0, "nica": 0, "mpor_days": 10}
    res = saccr.saccr_ead([swap], netting, margined=False)
    add_on = 0.005 * 1e6 * saccr.supervisory_duration(0, 5)
    assert isclose(res["add_on"]["aggregate"], add_on)
    assert res["multiplier"] == 1.0 and isclose(res["ead"], 1.4 * add_on)


def test_saccr_offsetting_and_negative_mtm_reduce_ead():
    base = {"kind": "ir_swap", "notional": 1e6, "start": 0, "end": 3, "mtm": 0, "currency": "BRL",
            "pair": "", "option": "call", "moneyness": 1}
    netting = {"margined": False, "collateral": 0, "threshold": 0, "mta": 0, "nica": 0, "mpor_days": 10}
    one = saccr.saccr_ead([{**base, "name": "a", "long": True}], netting, False)
    hedged = saccr.saccr_ead([{**base, "name": "a", "long": True}, {**base, "name": "b", "long": False}], netting, False)
    assert hedged["add_on"]["aggregate"] < 1e-6 < one["add_on"]["aggregate"]   # mesma faixa: compensa
    underwater = saccr.saccr_ead([{**base, "name": "a", "long": True, "mtm": -50_000}], netting, False)
    assert underwater["multiplier"] < 1 and underwater["ead"] < one["ead"]


CAP = dict(share_capital=800, reserves=300, retained_earnings=150, oci=-20, treasury_shares=10, goodwill=60,
           intangibles=40, dta_tax_losses=30, pension_assets=5, other_deductions=0, dta_temporary=150,
           significant_investments=70, at1=100, tier2=150, rwa_before_thresholds=9000, total_assets=18000,
           derivatives_rc=150, derivatives_pfe=250, sft=600,
           off_balance=[{"name": "x", "amount": 1000, "ccf": 0.5}])


def test_cet1_threshold_deductions():
    r = capital_structure.cet1_build(CAP)
    base = (800 + 300 + 150 - 20 - 10) - (60 + 40 + 30 + 5)
    excess_dta = 150 - 0.1 * base                      # créditos temporários acima de 10%
    remaining = 0.1 * base + 70                        # o que fica abaixo dos limites individuais
    excess_aggregate = max(remaining - 0.15 * base, 0)
    assert isclose(r["cet1"], base - excess_dta - excess_aggregate)
    assert isclose(r["weighted_250"], remaining - excess_aggregate)


def test_leverage_ratio():
    r = capital_structure.run(CAP)
    exposure = 18000 - r["cet1"]["deducted"] + 1.4 * 400 + 600 + 500
    assert isclose(r["leverage"]["total"], exposure)
    assert isclose(r["leverage"]["ratio"], r["tier1"] / exposure)


def test_liquidity_gap_and_survival():
    items = [{"name": "CDB", "kind": "out", "amounts": [0, 100, 0, 0, 0, 0, 0, 0], "stress": 1.0, "base_rollover": 0.8},
             {"name": "Crédito", "kind": "in", "amounts": [0, 0, 50, 0, 0, 0, 0, 0], "stress": 0.5, "base_rollover": 0}]
    base = liquidity_mgmt.liquidity_gap(items, buffer=60, buffer_haircut=0.0, stressed=False)
    stress = liquidity_mgmt.liquidity_gap(items, buffer=60, buffer_haircut=0.0, stressed=True)
    assert isclose(base["cumulative"][1], 40) and isclose(stress["cumulative"][1], -40)
    horizon = liquidity_mgmt.survival_horizon(stress["cumulative"], stress["start"])
    assert 1 < horizon < 30
    assert liquidity_mgmt.survival_horizon(base["cumulative"], base["start"]) is None


def test_ftp_margins():
    curve = [{"term": 0, "bps": 0}, {"term": 5, "bps": 100}]
    out = liquidity_mgmt.ftp([{"name": "c", "side": "asset", "amount": 100, "term": 2.5, "client_rate": 0.20},
                              {"name": "d", "side": "liability", "amount": 100, "term": 2.5, "client_rate": 0.13}],
                             0.14, curve)
    assert isclose(out[0]["ftp_rate"], 0.145) and isclose(out[0]["margin"], 0.055)
    assert isclose(out[1]["margin"], 0.015)


def test_nmd_caps_and_prepayment_shortens_duration():
    flows, info = irrbb_behavioral.nmd_cash_flows(100, "wholesale", 0.9, 1.0, 6.0)
    assert info["core_share"] == 0.5 and info["avg_maturity"] == 4.0
    assert isclose(flows.sum(), 100)
    loan = lambda cpr: irrbb_behavioral.loan_cash_flows(1000, 0.18, 60, cpr)
    assert isclose(irrbb_behavioral.present_value(loan(0.0), 0.18), 1000, rel_tol=1e-6)
    assert irrbb_behavioral.macaulay_duration(loan(0.2), 0.14) < irrbb_behavioral.macaulay_duration(loan(0.0), 0.14)
    assert irrbb_behavioral.prepayment_rate(0.08, 0.03, 0.18, 0.12) > irrbb_behavioral.prepayment_rate(0.08, 0.03, 0.18, 0.18)
