import pytest
from fastapi.testclient import TestClient

from kuze.api.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _login(client, user="alice", pw="pw-alice-123"):
    r = client.post("/api/auth/login", json={"username": user, "password": pw})
    assert r.status_code == 200, r.text
    return r


def test_health_and_auth(client):
    assert client.get("/api/health").json()["ok"] is True
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={"username": "alice", "password": "wrong"}).status_code == 401
    _login(client)
    me = client.get("/api/auth/me").json()
    assert me["username"] == "alice"


def test_model_endpoints_wait_for_the_build(client):
    _login(client)
    assert client.get("/api/slate").status_code == 503


def test_bet_lifecycle(client):
    _login(client)
    bad = client.post("/api/bets", json={"game_id": "2026_03_LAC_BUF", "market": "spread", "selection": "LAC +7",
                                         "odds": -50, "stake": 10})
    assert bad.status_code == 400
    r = client.post("/api/bets", json={"game_id": "2026_03_LAC_BUF", "market": "spread", "selection": "LAC +7",
                                       "side": "away", "line": 7, "odds": -110, "stake": 11, "label": "PLAY"})
    assert r.status_code == 200, r.text
    bet_id = r.json()["id"]
    assert client.patch(f"/api/bets/{bet_id}", json={"result": "win"}).status_code == 200
    mine = client.get("/api/bets").json()
    assert mine[0]["result"] == "win" and mine[0]["profit"] == pytest.approx(10.0)
    # bob can't see alice's bets under "mine" but sees them under "team"
    _login(client, "bob", "pw-bob-456")
    assert client.get("/api/bets").json() == []
    assert len(client.get("/api/bets?scope=team").json()) == 1
    assert client.delete(f"/api/bets/{bet_id}").status_code in (403, 404)


def test_failed_logins_are_rate_limited(client):
    from kuze.api.routes import auth as auth_routes
    auth_routes._FAILS.clear()
    for _ in range(auth_routes.MAX_FAILS):
        assert client.post("/api/auth/login", json={"username": "bob", "password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "bob", "password": "pw-bob-456"}).status_code == 429
    auth_routes._FAILS.clear()
    _login(client, "bob", "pw-bob-456")
