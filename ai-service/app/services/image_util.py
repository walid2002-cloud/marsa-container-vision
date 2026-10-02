"""Réduction mémoire pour uploads (photos téléphone haute résolution)."""

from __future__ import annotations

import cv2
import numpy as np

DEFAULT_MAX_SIDE = int(__import__("os").getenv("IMAGE_MAX_SIDE", "1920"))


def resize_bgr_max(bgr: np.ndarray, max_side: int = DEFAULT_MAX_SIDE) -> np.ndarray:
    if bgr is None or bgr.size == 0:
        return bgr
    h, w = bgr.shape[:2]
    if max(h, w) <= max_side:
        return bgr
    scale = max_side / max(h, w)
    return cv2.resize(
        bgr,
        (int(w * scale), int(h * scale)),
        interpolation=cv2.INTER_AREA,
    )


def resize_image_file_inplace(path: str, max_side: int = DEFAULT_MAX_SIDE) -> bool:
    bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    if bgr is None:
        return False
    resized = resize_bgr_max(bgr, max_side)
    if resized is bgr:
        return True
    cv2.imwrite(path, resized)
    return True
