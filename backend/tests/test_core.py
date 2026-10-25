from math import exp, isclose

from app.core import capital, irrbb, liquidity, market, rwa_sens, stress


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
    res = rwa_sens.girr([], [short], False)
    assert res["curvature"]["scenarios"]["medium"] > 0
    long_res = rwa_sens.girr([], [DI_CALL], False)
    assert long_res["curvature"]["scenarios"]["medium"] == 0


def test_option_delta_merges_into_named_curve():
    dv01 = [0.0] * 11
    curves = [{"name": "Pré", "currency": "BRL", "settlement": "BRL", "dv01": dv01}]
    res = rwa_sens.girr(curves, [DI_CALL], False)
    assert len(res["curves"]) == 1
    ws_2y = res["curves"][0]["weighted_sensitivities"][4]
    assert isclose(ws_2y, rwa_sens.option_dv01(DI_CALL) / 0.0001 * 0.028)
