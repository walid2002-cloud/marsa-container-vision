"""
Phase 5 — Gestion propre du modèle YOLO (expérimental vs custom conteneurs).

Le modèle actuel (yolov8n) est un modèle **COCO générique** : il ne détecte pas
les conteneurs maritimes spécifiquement. Ce module prépare l'architecture pour
charger plus tard un modèle YOLO entraîné spécialement sur des conteneurs, sans
jamais faire planter l'application si ce modèle custom est absent.

Modes retournés par ``get_yolo_model_mode()`` :
  - disabled     : YOLO_ENABLED=false → OCR seul
  - experimental : modèle COCO générique (yolov8n) — heuristique ROI uniquement
  - custom       : modèle custom conteneurs présent et chargé
  - unavailable  : mode custom demandé mais modèle introuvable → fallback propre

Variables d'environnement :
  YOLO_ENABLED               true/false          (défaut false)
  YOLO_MODEL_MODE            experimental|custom (défaut experimental)
  YOLO_MODEL_PATH            chemin .pt custom   (défaut vide)
  YOLO_CONFIDENCE_THRESHOLD  seuil 0–1           (défaut 0.28)
  YOLO_CLASSES_CONFIG        chemin dataset.yaml (défaut /app/dataset/dataset.yaml)
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

log = logging.getLogger("marsa.yolo")

# Orientations prévues pour un futur modèle custom (aucune détection réelle pour l'instant).
ORIENTATIONS = ("front", "back", "left_side", "right_side", "angled", "unknown")


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, "true" if default else "false").lower() in ("1", "true", "yes")


def is_enabled() -> bool:
    return _env_bool("YOLO_ENABLED", False)


def requested_mode() -> str:
    return (os.getenv("YOLO_MODEL_MODE", "experimental") or "experimental").strip().lower()


def model_path() -> str:
    return (os.getenv("YOLO_MODEL_PATH", "") or "").strip()


def confidence_threshold() -> float:
    try:
        return float(os.getenv("YOLO_CONFIDENCE_THRESHOLD", "0.28"))
    except ValueError:
        return 0.28


def classes_config_path() -> str:
    return (os.getenv("YOLO_CLASSES_CONFIG", "/app/dataset/dataset.yaml") or "").strip()


def custom_model_available() -> bool:
    p = model_path()
    return bool(p) and os.path.isfile(p)


def get_yolo_model_mode() -> str:
    """Résout le mode effectif, sans jamais lever d'exception."""
    if not is_enabled():
        return "disabled"

    if requested_mode() == "custom":
        if custom_model_available():
            return "custom"
        log.warning(
            "[YOLO] Mode custom demandé mais modèle introuvable (YOLO_MODEL_PATH=%r) "
            "→ fallback 'unavailable'. L'application continue avec OCR / YOLO expérimental.",
            model_path(),
        )
        return "unavailable"

    return "experimental"


def is_coco_general() -> bool:
    """True si YOLO tourne encore sur un modèle COCO générique (non conteneurs)."""
    return get_yolo_model_mode() == "experimental"


def yolo_status() -> Dict[str, Any]:
    """État YOLO exposable à l'API / l'UI."""
    mode = get_yolo_model_mode()
    warning = None
    if mode == "experimental":
        warning = (
            "YOLO utilise un modèle COCO générique (yolov8n). Il ne détecte pas "
            "spécifiquement les conteneurs maritimes. Un modèle custom est nécessaire."
        )
    elif mode == "unavailable":
        warning = (
            "Mode YOLO custom demandé mais modèle introuvable. Fonctionnement en "
            "repli sur OCR seul (aucune détection YOLO conteneur)."
        )
    elif mode == "disabled":
        warning = "YOLO désactivé (YOLO_ENABLED=false). Détection par OCR uniquement."

    return {
        "yolo_model_mode": mode,
        "yolo_enabled": is_enabled(),
        "requested_mode": requested_mode(),
        "model_path": model_path() or None,
        "custom_model_available": custom_model_available(),
        "classes_config": classes_config_path() or None,
        "confidence_threshold": confidence_threshold(),
        "is_coco_general": is_coco_general(),
        "warning": warning,
    }


def placeholder_fields(
    *,
    yolo_detected: Optional[bool] = None,
    yolo_confidence: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Champs YOLO conteneurs préparés pour un futur modèle custom.

    Tant qu'aucun modèle custom n'est chargé, on reste honnête : les champs
    spécialisés (code_area, seal, door, orientation) sont ``None`` / ``unknown``.
    """
    return {
        "container_detected": bool(yolo_detected) if yolo_detected is not None else None,
        "container_confidence": (
            round(float(yolo_confidence), 4) if yolo_confidence is not None else None
        ),
        "code_area_detected": None,
        "code_area_confidence": None,
        "orientation": "unknown",
        "door_detected": None,
        "seal_detected": None,
        "yolo_confidence": (
            round(float(yolo_confidence), 4) if yolo_confidence is not None else None
        ),
        "yolo_model_mode": get_yolo_model_mode(),
    }
