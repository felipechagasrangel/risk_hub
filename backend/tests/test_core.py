from math import isclose

from app.core import capital, irrbb, liquidity, market


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
