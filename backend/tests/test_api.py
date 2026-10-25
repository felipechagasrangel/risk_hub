from fastapi.testclient import TestClient

from app.main import app

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
    r = client.post("/api/capital/rwa-sens/girr-delta", json={"curves": [
        {"name": "Pré", "currency": "brl", "settlement": "brl", "dv01": [0, 0, 0, -100, 0, 0, 0, 0, 0, 0, 0]},
        {"name": "Treasury", "currency": "USD", "settlement": "USD", "dv01": [0] * 10 + [-50]},
    ]})
    assert r.status_code == 200
    body = r.json()
    assert set(body["scenarios"]) == {"medium", "high", "low"}
    assert body["rwa"] > 0
