"""
Service YOLOv8 — ROI « conteneur / zone utile » pour le pipeline avant OCR.

Le modèle yolov8n (COCO) ne connaît pas la classe « conteneur maritime ».
On sélectionne heuristiquement une ROI pertinente (véhicules volumineux,
plus grande boîte fiable) pour rapprocher le comportement d’un détecteur
industriel jusqu’à entraînement custom.

Désactivation : YOLO_ENABLED=false → pas d’inférence (économie CPU).
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

import cv2

# Classes COCO souvent pertinentes pour une scène portuaire / logistique
_PREFERRED_CLASSES = frozenset(
    {
        "truck",
        "bus",
        "train",
        "boat",
        "airplane",
        "car",
    }
)

YOLO_ENABLED = os.getenv("YOLO_ENABLED", "false").lower() in ("1", "true", "yes")
YOLO_CONF = float(os.getenv("YOLO_CONFIDENCE_THRESHOLD", "0.28"))


def is_yolo_enabled() -> bool:
    return YOLO_ENABLED


def _expand_bbox(
    bbox: Dict[str, int], w: int, h: int, margin_ratio: float = 0.08
) -> Dict[str, int]:
    x1, y1, x2, y2 = bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]
    mw = int((x2 - x1) * margin_ratio)
    mh = int((y2 - y1) * margin_ratio)
    return {
        "x1": max(0, x1 - mw),
        "y1": max(0, y1 - mh),
        "x2": min(w - 1, x2 + mw),
        "y2": min(h - 1, y2 + mh),
    }


def _area(b: Dict[str, int]) -> int:
    return max(0, b["x2"] - b["x1"]) * max(0, b["y2"] - b["y1"])


def detect_objects_on_image(image_path: str) -> List[Dict[str, Any]]:
    """Détections brutes YOLO (COCO)."""
    if not YOLO_ENABLED:
        return []
    try:
        from app.services.experimental_yolo import detect_objects

        return detect_objects(image_path, confidence_threshold=YOLO_CONF)
    except Exception as e:
        print(f"[YOLO_SERVICE] Erreur inférence : {e}")
        return []


def select_best_roi(image_path: str) -> Tuple[Optional[Dict[str, int]], float, List[Dict[str, Any]]]:
    """
    Choisit une bounding box pour découper l’image avant OCR.

    Returns:
        (bbox_xyxy ou None, confiance du meilleur candidat, toutes les détections)
    """
    dets = detect_objects_on_image(image_path)
    if not dets:
        return None, 0.0, []

    img = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if img is None:
        return None, 0.0, dets
    h, w = img.shape[:2]
    img_area = h * w

    preferred = [d for d in dets if d.get("class_name") in _PREFERRED_CLASSES]
    pool = preferred if preferred else dets

    best = max(pool, key=lambda d: (_area(d["bbox"]), d.get("confidence", 0)))
    if _area(best["bbox"]) < 0.02 * img_area and preferred:
        best = max(preferred, key=lambda d: _area(d["bbox"]))

    bbox = {k: int(v) for k, v in best["bbox"].items()}
    bbox = _expand_bbox(bbox, w, h)
    return bbox, float(best.get("confidence", 0.0)), dets


def crop_bgr(image_path: str, bbox: Dict[str, int]) -> np.ndarray:
    """Découpe la zone BGR depuis le fichier image."""
    img = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Image illisible")
    return img[bbox["y1"] : bbox["y2"], bbox["x1"] : bbox["x2"]].copy()
