"""
Router FastAPI pour la détection de conteneurs.

Expose le endpoint POST /detect qui reçoit un code conteneur
et retourne le résultat de la détection (mock ou réel selon la config).
"""

from fastapi import APIRouter, HTTPException
from app.models.schemas import DetectionRequest, DetectionResponse
from app.services.detector import detect_container

router = APIRouter()


@router.post("/detect", response_model=DetectionResponse)
async def detect(request: DetectionRequest):
    """
    Recherche un conteneur dans les caméras de surveillance.

    Reçoit un code conteneur et retourne le résultat de la détection
    avec la caméra, la zone, le score de confiance et l'image de preuve.

    En mode simulation (mock) : compare le code à une liste prédéfinie.
    En mode réel (futur) : exécute le pipeline YOLO + OCR.
    """
    if not request.container_code or request.container_code.strip() == "":
        raise HTTPException(status_code=400, detail="Le code du conteneur est requis.")

    result = detect_container(request.container_code)
    return result
