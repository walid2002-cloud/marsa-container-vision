"""
Orchestrateur principal de la détection.

Modes : mock | demo | real
"""

from app.config import DETECTION_MODE
from app.models.schemas import DetectionResponse
from app.services.mock_detector import mock_detect
from app.services.container_code_validator import validate_container_code


def detect_container(container_code: str) -> DetectionResponse:
    """
    Point d'entrée de la détection avec validation du format de code.

    En mode ``demo`` : recherche d'abord dans ``demo_containers.json`` (fiable),
    puis validation + pipeline OCR/YOLO si aucun match index.
    """
    raw = (container_code or "").strip()
    if not raw:
        return DetectionResponse(
            searched_code="",
            detected=False,
            message="Le code du conteneur est requis.",
            camera_name=None,
            zone=None,
            confidence=0.0,
            image_path=None,
            detected_at=None,
            global_confidence=0.0,
            yolo_confidence=None,
            detection_status="invalid_code",
            source_match="none",
        )

    if DETECTION_MODE == "demo":
        from app.services.demo_index_service import try_demo_index_detection
        from app.services.demo_detector import demo_detect

        idx_resp = try_demo_index_detection(raw)
        if idx_resp is not None:
            return idx_resp

        v = validate_container_code(raw)
        if not v.valid:
            return DetectionResponse(
                searched_code=raw,
                detected=False,
                message=v.error_message or "Code conteneur invalide.",
                camera_name=None,
                zone=None,
                confidence=0.0,
                image_path=None,
                detected_at=None,
                global_confidence=0.0,
                yolo_confidence=None,
                detection_status="invalid_code",
                requested_code=raw,
                source_match="none",
            )

        return demo_detect(v.normalized, raw)

    v = validate_container_code(raw)
    if not v.valid:
        return DetectionResponse(
            searched_code=raw,
            detected=False,
            message=v.error_message or "Code conteneur invalide.",
            camera_name=None,
            zone=None,
            confidence=0.0,
            image_path=None,
            detected_at=None,
            global_confidence=0.0,
            yolo_confidence=None,
            detection_status="invalid_code",
            requested_code=raw,
            source_match="none",
        )

    if DETECTION_MODE == "real":
        return real_detect(v.normalized, raw)

    return mock_detect(v.normalized, raw)


def real_detect(normalized: str, display_code: str) -> DetectionResponse:
    """
    Détection réelle via le pipeline complet YOLO + OCR + RTSP.

    TODO : Implémenter quand le modèle YOLO est entraîné et les caméras RTSP connectées.
    """
    raise NotImplementedError(
        "La détection réelle YOLO + OCR n'est pas encore implémentée. "
        "Utilisez DETECTION_MODE=mock ou DETECTION_MODE=demo."
    )
