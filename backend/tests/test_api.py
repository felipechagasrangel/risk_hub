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
