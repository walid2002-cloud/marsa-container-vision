"""
Prétraitement OpenCV avant OCR.

Pipeline : lecture BGR → grayscale → resize (largeur max) → débruitage
→ CLAHE (contraste) → binarisation adaptative.

Retourne l'image traitée (numpy BGR) et un résumé des étapes pour le debug.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Tuple

import cv2
import numpy as np

# Largeur max après resize (préserve le ratio, accélère l'OCR)
_MAX_WIDTH = int(os.getenv("OCR_PREPROCESS_MAX_WIDTH", "1600"))


def preprocess_for_ocr(image_path: str) -> Dict[str, Any]:
    """
    Charge une image depuis le disque et applique le pipeline de prétraitement.

    Returns:
        dict avec clés :
          - original_shape: (h, w) de l'image lue
          - processed_bgr: ndarray BGR prêt pour EasyOCR (readtext accepte BGR/RGB)
          - stages: liste d'étapes décrites (pour logs / API)
          - params: paramètres numériques utilisés
    """
    stages: list[str] = []
    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Image introuvable : {image_path}")

    bgr = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"Impossible de lire l'image : {image_path}")

    original_shape = (bgr.shape[0], bgr.shape[1])
    stages.append(f"original {original_shape[1]}x{original_shape[0]}")

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    stages.append("grayscale")

    h, w = gray.shape[:2]
    scale = 1.0
    if w > _MAX_WIDTH:
        scale = _MAX_WIDTH / float(w)
        new_w = int(w * scale)
        new_h = int(h * scale)
        gray = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_AREA)
        stages.append(f"resize scale={scale:.3f} -> {new_w}x{new_h}")

    denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)
    stages.append("denoise (fastNlMeans)")

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrast = clahe.apply(denoised)
    stages.append("CLAHE contrast")

    bin_img = cv2.adaptiveThreshold(
        contrast,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        9,
    )
    stages.append("adaptive threshold")

    processed_bgr = cv2.cvtColor(bin_img, cv2.COLOR_GRAY2BGR)
    stages.append("binarized -> 3 channels for OCR")

    return {
        "original_shape": original_shape,
        "processed_bgr": processed_bgr,
        "stages": stages,
        "params": {"max_width": _MAX_WIDTH, "resize_scale": round(scale, 4)},
    }


def preprocess_numpy_bgr(bgr: np.ndarray) -> Dict[str, Any]:
    """Même pipeline à partir d'un array BGR (upload mémoire)."""
    stages: list[str] = []
    if bgr is None or bgr.size == 0:
        raise ValueError("Image vide")

    original_shape = (bgr.shape[0], bgr.shape[1])
    stages.append(f"original {original_shape[1]}x{original_shape[0]}")

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    stages.append("grayscale")

    h, w = gray.shape[:2]
    scale = 1.0
    if w > _MAX_WIDTH:
        scale = _MAX_WIDTH / float(w)
        new_w = int(w * scale)
        new_h = int(h * scale)
        gray = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_AREA)
        stages.append(f"resize scale={scale:.3f}")

    denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)
    stages.append("denoise")

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrast = clahe.apply(denoised)
    stages.append("CLAHE")

    bin_img = cv2.adaptiveThreshold(
        contrast,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        9,
    )
    stages.append("adaptive threshold")

    processed_bgr = cv2.cvtColor(bin_img, cv2.COLOR_GRAY2BGR)
    return {
        "original_shape": original_shape,
        "processed_bgr": processed_bgr,
        "stages": stages,
        "params": {"max_width": _MAX_WIDTH, "resize_scale": round(scale, 4)},
    }


_SHARPEN_KERNEL = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)


def preprocess_otsu_bgr(bgr: np.ndarray) -> Dict[str, Any]:
    """
    Variante de prétraitement alternative (Phase 5) : grayscale → CLAHE →
    sharpen léger → seuillage Otsu. Utile en repli quand la binarisation
    adaptative ne donne rien (contraste global fort, texte peint sur métal).
    """
    stages: list[str] = []
    if bgr is None or bgr.size == 0:
        raise ValueError("Image vide")

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    stages.append("grayscale")

    h, w = gray.shape[:2]
    scale = 1.0
    if w > _MAX_WIDTH:
        scale = _MAX_WIDTH / float(w)
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        stages.append(f"resize scale={scale:.3f}")

    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    contrast = clahe.apply(gray)
    stages.append("CLAHE clip=3")

    sharp = cv2.filter2D(contrast, -1, _SHARPEN_KERNEL)
    stages.append("sharpen léger")

    _th, otsu = cv2.threshold(sharp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    stages.append("seuillage Otsu")

    processed_bgr = cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR)
    return {
        "original_shape": (bgr.shape[0], bgr.shape[1]),
        "processed_bgr": processed_bgr,
        "stages": stages,
        "params": {"max_width": _MAX_WIDTH, "resize_scale": round(scale, 4)},
    }
