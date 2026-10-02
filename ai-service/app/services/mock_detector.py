"""
Détecteur en mode simulation (mock).
"""

from datetime import datetime

from app.config import MOCK_CONTAINERS
from app.models.schemas import DetectionResponse


def mock_detect(normalized_code: str, display_code: str) -> DetectionResponse:
    """
    Simule la détection d'un conteneur par comparaison avec une liste fixe.

    Args:
        normalized_code: code normalisé pour la recherche dans MOCK_CONTAINERS
        display_code: affichage utilisateur (searched_code)
    """
    key = normalized_code
    if key in MOCK_CONTAINERS:
        info = MOCK_CONTAINERS[key]
        conf = float(info["confidence"])
        img = f"/evidence/container_{key}.jpg"
        return DetectionResponse(
            searched_code=display_code,
            detected=True,
            message="Conteneur détecté dans les caméras analysées (simulation).",
            camera_name=info["camera_name"],
            zone=info["zone"],
            confidence=conf,
            image_path=img,
            detected_at=datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            global_confidence=round(min(0.99, conf), 4),
            yolo_confidence=None,
            detection_status="ok",
            requested_code=display_code,
            detected_code=key,
            matched_image=img,
            match_type="exact",
            similarity_score=1.0,
            exact_match=True,
            fuzzy_match=False,
            match_rejection_reason=None,
            matched_candidate=key,
            rejected_candidates=None,
            source_match="mock_registry",
        )

    return DetectionResponse(
        searched_code=display_code,
        detected=False,
        message="Conteneur non détecté dans les caméras analysées (simulation).",
        camera_name=None,
        zone=None,
        confidence=0.0,
        image_path=None,
        detected_at=None,
        global_confidence=0.0,
        yolo_confidence=None,
        detection_status="ok",
        requested_code=display_code,
        detected_code=None,
        matched_image=None,
        match_type="none",
        similarity_score=None,
        exact_match=False,
        fuzzy_match=False,
        match_rejection_reason="not_in_mock_registry",
        matched_candidate=None,
        rejected_candidates=None,
        source_match="none",
    )
