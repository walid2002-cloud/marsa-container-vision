"""Tests unitaires pour le service de détection."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_detect_known_container():
    """Un conteneur connu doit être détecté en mode mock."""
    response = client.post("/detect", json={"container_code": "79943"})
    assert response.status_code == 200
    data = response.json()
    assert data["detected"] is True
    assert data["searched_code"] == "79943"
    assert data["camera_name"] is not None
    assert data["confidence"] > 0


def test_detect_unknown_container():
    """Un conteneur inconnu ne doit pas être détecté."""
    response = client.post("/detect", json={"container_code": "99999"})
    assert response.status_code == 200
    data = response.json()
    assert data["detected"] is False
    assert data["camera_name"] is None
    assert data["confidence"] == 0


def test_detect_empty_code():
    """Un code vide doit retourner une erreur 400."""
    response = client.post("/detect", json={"container_code": ""})
    assert response.status_code == 400
