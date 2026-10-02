"""
OCR focalisée sur une ROI regroupant les fragments alphanumériques pertinents.

Utilisé quand le code recherché commence par 4 lettres (type ISO).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np

from app.services.experimental_ocr import ocr_read_numpy
from app.services.preprocessing_iso import preprocess_iso_enhanced_bgr
from app.services.ocr_normalizer import strip_special_and_upper


def _bbox_union(polygons: List[List[List[int]]], pad_ratio: float = 0.12) -> Tuple[int, int, int, int]:
    xs: List[float] = []
    ys: List[float] = []
    for poly in polygons:
        for p in poly:
            xs.append(float(p[0]))
            ys.append(float(p[1]))
    if not xs:
        return 0, 0, 0, 0
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h = x1 - x0, y1 - y0
    pad = max(6.0, pad_ratio * max(w, h, 24.0))
    return int(x0 - pad), int(y0 - pad), int(x1 + pad), int(y1 + pad)


def _relevant_for_iso_focus(r: Dict[str, Any], prefix4: str) -> bool:
    t = strip_special_and_upper(r.get("text") or "")
    if len(t) < 1:
        return False
    px = prefix4.upper()[:4]
    if len(px) >= 2 and t.startswith(px[:2]):
        return True
    if re.search(r"[A-Z]{2,4}", t) and re.search(r"\d", t):
        return True
    if re.match(r"^[A-Z]{3,4}$", t):
        return True
    if re.match(r"^\d{2,7}$", t):
        return True
    return False


def augment_ocr_with_iso_focused_pass(
    bgr: np.ndarray,
    prefix4: str,
    seed_results: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Recadre autour des fragments pertinents, agrandit, repasse EasyOCR.

    Les bbox retournées sont exprimées dans le repère de l'image d'entrée.
    """
    if bgr is None or bgr.size == 0 or not seed_results:
        return list(seed_results)

    rel = [r for r in seed_results if _relevant_for_iso_focus(r, prefix4)]
    if not rel:
        return list(seed_results)

    polys = [r["bbox"] for r in rel if r.get("bbox")]
    if not polys:
        return list(seed_results)

    H, W = bgr.shape[:2]
    x0, y0, x1, y1 = _bbox_union(polys)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(W, x1), min(H, y1)
    if x1 <= x0 + 8 or y1 <= y0 + 8:
        return list(seed_results)

    crop = bgr[y0:y1, x0:x1]
    if crop.size == 0:
        return list(seed_results)

    try:
        iso_pre = preprocess_iso_enhanced_bgr(crop, scale=2.8)
        extra = ocr_read_numpy(iso_pre["processed_bgr"])
    except Exception:
        return list(seed_results)

    shifted: List[Dict[str, Any]] = []
    for e in extra:
        poly = e.get("bbox") or []
        new_poly: List[List[int]] = []
        for p in poly:
            new_poly.append([int(p[0] + x0), int(p[1] + y0)])
        shifted.append({
            "text": e.get("text", ""),
            "confidence": float(e.get("confidence") or 0.0),
            "bbox": new_poly,
            "_source": "iso_focused_crop",
        })
    return list(seed_results) + shifted
