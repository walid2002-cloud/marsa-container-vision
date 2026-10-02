"""
Prétraitement renforcé pour petits textes (codes ISO sur conteneurs).

Upscale + sharpen + CLAHE + seuillage adaptatif + fermeture morphologique.
Utilisé en second passage OCR (sans casser le pipeline principal).
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

import cv2
import numpy as np


def preprocess_iso_enhanced_bgr(
    bgr: np.ndarray,
    scale: float = 2.5,
) -> Dict[str, Any]:
    """
    Prépare une image BGR pour mieux lire de petits caractères alphanumériques.

    Args:
        bgr: image couleur BGR.
        scale: facteur d'agrandissement (2.0–3.0 recommandé).

    Returns:
        dict: processed_bgr (3 canaux), stages (liste str).
    """
    stages: List[str] = []
    if bgr is None or bgr.size == 0:
        raise ValueError("Image vide")

    h, w = bgr.shape[:2]
    interp = cv2.INTER_CUBIC if scale > 1.0 else cv2.INTER_AREA
    nh, nw = max(1, int(h * scale)), max(1, int(w * scale))
    up = cv2.resize(bgr, (nw, nh), interpolation=interp)
    stages.append(f"iso_enhance upscale x{scale:.2f} -> {nw}x{nh}")

    gray = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
    kernel_sharp = np.array([[-1.0, -1.0, -1.0], [-1.0, 9.0, -1.0], [-1.0, -1.0, -1.0]], dtype=np.float32)
    sharp = cv2.filter2D(gray, -1, kernel_sharp)
    sharp_u8 = np.clip(sharp, 0, 255).astype(np.uint8)
    stages.append("iso_enhance sharpen 3x3")

    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    eq = clahe.apply(sharp_u8)
    stages.append("iso_enhance CLAHE clip=3")

    ath = cv2.adaptiveThreshold(
        eq,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        15,
        5,
    )
    stages.append("iso_enhance adaptive threshold")

    k = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    closed = cv2.morphologyEx(ath, cv2.MORPH_CLOSE, k, iterations=1)
    stages.append("iso_enhance morphology close 2x2")

    out_bgr = cv2.cvtColor(closed, cv2.COLOR_GRAY2BGR)
    return {
        "processed_bgr": out_bgr,
        "stages": stages,
        "params": {"scale": scale},
    }
