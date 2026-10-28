from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_var_endpoint_returns_three_methods():
    r = client.post("/api/market/var", json={"distribution": "t"})
    assert r.status_code == 200
    body = r.json()
    assert set(body["methods"]) == {"parametric", "historical", "monte_carlo"}
    assert body["backtest"]["observations"] == 250


def test_rwa_endpoint():
    r = client.post("/api/capital/rwa", json={
        "exposures": [{"name": "Corp", "amount": 1000, "risk_weight": 1.0}],
        "cet1": 100,
    })
    assert r.status_code == 200
    assert r.json()["rwa"]["total"] == 1000


def test_irrbb_endpoint():
    r = client.post("/api/irrbb/analyze", json={
        "positions": [{"name": "Crédito", "side": "asset", "amount": 100,
                       "rate": 0.12, "repricing": 3}],
        "curve": [{"tenor": 1, "rate": 0.12}, {"tenor": 5, "rate": 0.12}],
        "tier1": 20,
    })
    assert r.status_code == 200
    assert len(r.json()["scenarios"]) == 6


def test_stress_endpoint():
    r = client.post("/api/market/stress", json={"positions": [
        {"name": "Ações", "factor": "equity", "value": 1000, "vol_annual": 0.25},
        {"name": "Dólar", "factor": "fx", "value": 500, "vol_annual": 0.15},
    ]})
    assert r.status_code == 200
    body = r.json()
    assert body["var_10d"] > body["var_1d"] > 0
    assert len(body["scenarios"]) == 6


def test_girr_delta_endpoint():
    r = client.post("/api/market/rwa-sens", json={"curves": [
        {"name": "Pré", "currency": "brl", "settlement": "brl", "dv01": [0, 0, 0, -100, 0, 0, 0, 0, 0, 0, 0]},
        {"name": "Treasury", "currency": "USD", "settlement": "USD", "dv01": [0] * 10 + [-50]},
    ]})
    assert r.status_code == 200
    body = r.json()
    assert set(body["scenarios"]) == {"medium", "high", "low"}
    assert body["rwa"] > 0


def test_rwa_sens_rejects_brl_fx_pair():
    r = client.post("/api/market/rwa-sens", json={"fx": [{"name": "x", "currency": "BRL", "exposure": 1}]})
    assert r.status_code == 422


def test_bond_valuation_endpoint():
    r = client.post("/api/valuation/bond", json={})
    assert r.status_code == 200
    assert r.json()["today"]["unrealized"] < 0


def test_swap_and_floating_endpoints():
    assert client.post("/api/valuation/swap", json={}).status_code == 200
    assert client.post("/api/valuation/floating", json={}).status_code == 200
    assert client.post("/api/valuation/swap", json={"elapsed_du": 600}).status_code == 422


def test_xva_endpoints_and_source_whitelist():
    assert client.post("/api/xva/paths", json={"model": "gbm", "n_paths": 500}).status_code == 200
    assert client.post("/api/xva/run", json={"instrument": "ndf", "n_paths": 500}).status_code == 200
    src = client.get("/api/source/cva")
    assert src.status_code == 200 and src.json()["code"].startswith("def cva(")
    assert client.get("/api/source/__import__").status_code == 404


def test_csa_endpoint():
    r = client.post("/api/xva/csa", json={})
    assert r.status_code == 200
    s = r.json()["summary"]
    assert s["max_exposure"] < s["max_exposure_uncoll"]


def test_quote_and_margin_grid_endpoints():
    q = client.post("/api/xva/quote", json={"n_paths": 500, "maturity": 2})
    assert q.status_code == 200 and q.json()["payments"] == 4
    g = client.post("/api/xva/margin-grid", json={"n_paths": 300, "maturity": 1})
    assert g.status_code == 200
    body = g.json()
    assert len(body["matrix"]) == 4 and len(body["matrix"][0]["cells"]) == 5


def test_sensitivities_endpoint_and_snippet():
    r = client.post("/api/market/sensitivities", json={"instrument": "portfolio"})
    assert r.status_code == 200
    body = r.json()
    assert set(body["dv01"]) == {"pre", "cupom", "ipca"} and len(body["positions"]) == 6
    assert client.get("/api/source/key_rate_dv01").json()["module"] == "backend.core.sensitivities"


def test_curve_build_endpoint():
    body = {"contracts": [{"label": "F27", "du": 44, "rate": 0.1485}, {"label": "F28", "du": 296, "rate": 0.141}],
            "fx": [{"label": "DOLF27", "du": 44, "dc": 65, "price": 5.4856}]}
    r = client.post("/api/curves/build", json=body)
    assert r.status_code == 200
    assert len(r.json()["pre"]["fras"]) == 2 and r.json()["cupom"][0]["frc"] is None
    bad = client.post("/api/curves/build", json={"contracts": [{"label": "F27", "du": 44, "rate": 0.14}]})
    assert bad.status_code == 422


def test_ecl_endpoint():
    r = client.post("/api/credit/ecl", json={"days_past_due": 45})
    assert r.status_code == 200
    body = r.json()
    assert body["current"]["stage"] == 2 and body["ecl_lifetime"] > body["ecl_12m"]
    assert len(body["curve"]) == 145


def test_saccr_endpoint_margined_is_capped_by_unmargined():
    trades = [{"name": "NDF", "kind": "fx_forward", "notional": 1e7, "end": 1, "long": True, "mtm": 2e5}]
    r = client.post("/api/credit/saccr", json={"trades": trades, "netting": {"margined": True, "threshold": 5e6}})
    assert r.status_code == 200
    body = r.json()
    assert body["margined"]["ead"] <= body["unmargined"]["ead"] and body["cem"]["ead"] > 0


def test_management_endpoints():
    assert client.post("/api/capital/structure", json={}).status_code == 200
    body = {"buffer": 100, "items": [{"name": "x", "kind": "out", "amounts": [0, 10, 0, 0, 0, 0, 0, 0], "stress": 1}],
            "premium_curve": [{"term": 0, "bps": 0}, {"term": 5, "bps": 100}],
            "products": [{"name": "c", "side": "asset", "amount": 10, "term": 1, "client_rate": 0.2}]}
    r = client.post("/api/liquidity/management", json=body)
    assert r.status_code == 200 and r.json()["survival_stress"] is None
    b = client.post("/api/irrbb/behavioral", json={})
    assert b.status_code == 200 and len(b.json()["profile"]) == 13


def test_capital_liquidity_irrbb_topic_endpoints():
    y = {"ii": 100, "ie": 60, "iea": 1000}
    assert client.post("/api/capital/op-risk", json={"years": [y] * 3, "losses": [5] * 10}).status_code == 200
    assert client.post("/api/capital/buffers", json={}).status_code == 200
    assert client.post("/api/capital/plan", json={}).status_code == 200
    assert client.post("/api/capital/large-exposures", json={"tier1": 100, "exposures": [{"name": "a", "gross": 30}]}).status_code == 200
    f = client.post("/api/liquidity/funding", json={"buffer": 10, "sources": [{"name": "a", "product": "CDB", "amount": 5, "days": 3}],
                                                     "indicators": [{"name": "top", "metric": "top10_share", "amber": 0.5, "red": 0.9}]})
    assert f.status_code == 200 and f.json()["contingency"]["level"] == "contingência"
    bad = client.post("/api/liquidity/intraday", json={"opening": 1, "flows": [{"name": "x", "kind": "in", "amounts": [1, 2]}]})
    assert bad.status_code == 422
    item = {"name": "x", "side": "asset", "amount": 10, "indexer": "cdi"}
    assert client.post("/api/irrbb/basis", json={"items": [item]}).status_code == 200
    d = client.post("/api/irrbb/dynamic-nii", json={"items": [item], "scenarios": [
        {"name": "b", "delta_bps": 0, "ramp_months": 1}, {"name": "u", "delta_bps": 100, "ramp_months": 3}]})
    assert d.status_code == 200 and len(d.json()["scenarios"][0]["constant"]) == 24
    reg = {"tier1": 10, "currencies": [{"code": "BRL", "fx": 1, "curve": [{"tenor": 1, "rate": 0.1}, {"tenor": 5, "rate": 0.1}],
                                        "shocks": {"parallel": 0.04, "short": 0.05, "long": 0.03}}],
           "positions": [{"name": "a", "currency": "BRL", "side": "asset", "amount": 10, "rate": 0.1, "repricing": 3}]}
    assert client.post("/api/irrbb/regulatory", json=reg).status_code == 200
    bond = {"name": "b", "rating": "A", "notional": 10, "coupon": 0.15, "maturity": 3, "spread": 0.02}
    assert client.post("/api/irrbb/csrbb", json={"bonds": [bond]}).status_code == 200
