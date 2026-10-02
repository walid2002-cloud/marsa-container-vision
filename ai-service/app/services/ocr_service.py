"""
Service OCR — pipeline prétraitement + EasyOCR.

Utilisé par le mode démo et les routes /vision/*.
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Tuple

import numpy as np

# Largeur max pour le pipeline allégé (borne mémoire, image unique).
_LIGHT_MAX_WIDTH = int(os.getenv("OCR_LIGHT_MAX_WIDTH", "1400"))

from app.services.preprocessing import (
    preprocess_for_ocr,
    preprocess_numpy_bgr,
    preprocess_otsu_bgr,
)
from app.services.preprocessing_iso import preprocess_iso_enhanced_bgr
from app.services.experimental_ocr import ocr_read_numpy


def _augment_with_otsu(bgr, results: List[dict], stages: List[str]) -> Tuple[List[dict], List[str]]:
    """
    Passe de prétraitement alternative (Otsu + sharpen) fusionnée avec le résultat
    courant. Déclenchée seulement quand l'OCR est pauvre (< 2 lignes) pour limiter
    le coût CPU tout en récupérant les cas difficiles.
    """
    if bgr is None or len(results) >= 2:
        return results, stages
    try:
        otsu_pre = preprocess_otsu_bgr(bgr)
        r_otsu = ocr_read_numpy(otsu_pre["processed_bgr"])
        merged = merge_ocr_detections(results, r_otsu)
        return merged, stages + ["variante Otsu+sharpen"]
    except Exception:
        return results, stages


def _bbox_center(poly: List[List[int]]) -> Tuple[float, float]:
    if not poly:
        return 0.0, 0.0
    xs = [float(p[0]) for p in poly]
    ys = [float(p[1]) for p in poly]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _norm_ocr_text(t: str) -> str:
    return re.sub(r"\s+", "", (t or "").strip()).upper()


def merge_ocr_detections(
    primary: List[dict],
    secondary: List[dict],
    max_center_dist: float = 35.0,
) -> List[dict]:
    """Fusionne deux passages OCR (évite doublons : même texte + centre proche)."""
    out = list(primary)
    for s in secondary:
        st = _norm_ocr_text(s.get("text", ""))
        if not st:
            continue
        sx, sy = _bbox_center(s.get("bbox") or [])
        dup = False
        for p in out:
            if _norm_ocr_text(p.get("text", "")) != st:
                continue
            px, py = _bbox_center(p.get("bbox") or [])
            if (px - sx) ** 2 + (py - sy) ** 2 <= max_center_dist**2:
                dup = True
                break
        if not dup:
            out.append(s)
    return out


def normalize_container_code(raw_text: str) -> str:
    """Nettoie un texte OCR (lettres/chiffres uniquement, majuscules)."""
    cleaned = re.sub(r"[^A-Za-z0-9]", "", raw_text or "")
    return cleaned.upper()


def run_ocr_pipeline_on_path(image_path: str) -> Dict[str, Any]:
    """
    Exécute : prétraitement OpenCV → EasyOCR sur l'image traitée.

    Si aucun texte n'est détecté, retente avec un prétraitement plus doux
    (sans binarisation adaptative) pour limiter les échecs sur photos contrastées.

    Returns:
        dict avec :
          - ocr_results: liste {text, confidence, bbox}
          - preprocessing_stages, preprocessing_params
          - ocr_avg_confidence: moyenne des confiances OCR (0 si vide)
          - pipeline_mode: "full_preprocess" | "soft_fallback"
    """
    pre = preprocess_for_ocr(image_path)
    results = ocr_read_numpy(pre["processed_bgr"])
    mode = "full_preprocess"

    import cv2

    bgr_color = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if bgr_color is not None:
        try:
            iso_pre = preprocess_iso_enhanced_bgr(bgr_color)
            r2 = ocr_read_numpy(iso_pre["processed_bgr"])
            results = merge_ocr_detections(results, r2)
            pre["stages"] = pre["stages"] + iso_pre.get("stages", [])
        except Exception:
            pass

    results, pre["stages"] = _augment_with_otsu(bgr_color, results, pre["stages"])

    if not results:
        bgr = cv2.imread(image_path, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("Lecture image impossible")
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        soft = cv2.cvtColor(clahe.apply(gray), cv2.COLOR_GRAY2BGR)
        results = ocr_read_numpy(soft)
        mode = "soft_fallback"
        pre["stages"] = pre["stages"] + ["fallback: CLAHE sur niveaux de gris uniquement"]

    confs = [float(r["confidence"]) for r in results]
    avg = sum(confs) / len(confs) if confs else 0.0

    return {
        "ocr_results": results,
        "preprocessing_stages": pre["stages"],
        "preprocessing_params": pre.get("params", {}),
        "ocr_avg_confidence": round(avg, 4),
        "pipeline_mode": mode,
    }


def run_ocr_pipeline_on_numpy(bgr: np.ndarray) -> Dict[str, Any]:
    """Pipeline pour un upload en mémoire (array BGR)."""
    pre = preprocess_numpy_bgr(bgr)
    results = ocr_read_numpy(pre["processed_bgr"])
    mode = "full_preprocess"

    try:
        iso_pre = preprocess_iso_enhanced_bgr(bgr)
        r2 = ocr_read_numpy(iso_pre["processed_bgr"])
        results = merge_ocr_detections(results, r2)
        pre["stages"] = pre["stages"] + iso_pre.get("stages", [])
    except Exception:
        pass

    results, pre["stages"] = _augment_with_otsu(bgr, results, pre["stages"])

    if not results:
        import cv2

        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        soft = cv2.cvtColor(clahe.apply(gray), cv2.COLOR_GRAY2BGR)
        results = ocr_read_numpy(soft)
        mode = "soft_fallback"
        pre["stages"] = pre["stages"] + ["fallback: CLAHE gris"]

    confs = [float(r["confidence"]) for r in results]
    avg = sum(confs) / len(confs) if confs else 0.0

    return {
        "ocr_results": results,
        "preprocessing_stages": pre["stages"],
        "preprocessing_params": pre.get("params", {}),
        "ocr_avg_confidence": round(avg, 4),
        "pipeline_mode": mode,
    }


def run_ocr_pipeline_light_on_path(image_path: str) -> Dict[str, Any]:
    """
    Pipeline OCR **allégé** (Phase 5) pour l'analyse image unique (upload / caméra).

    Améliore le prétraitement par rapport à l'OCR brut (grayscale, resize borné,
    CLAHE, binarisation adaptative, repli Otsu si vide) tout en évitant les étapes
    très gourmandes en mémoire (fastNlMeansDenoising, upscale ISO 2.5x) qui, cumulées
    à YOLO chargé en mémoire, peuvent saturer le conteneur.
    """
    import cv2

    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Image introuvable : {image_path}")
    bgr = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"Impossible de lire l'image : {image_path}")

    stages: List[str] = []
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    stages.append("grayscale")

    max_w = min(_LIGHT_MAX_WIDTH, 1400)
    h, w = gray.shape[:2]
    scale = 1.0
    if w > max_w:
        scale = max_w / float(w)
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        stages.append(f"resize scale={scale:.3f}")

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrast = clahe.apply(gray)
    stages.append("CLAHE")

    bin_img = cv2.adaptiveThreshold(
        contrast, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 9
    )
    stages.append("binarisation adaptative")
    results = ocr_read_numpy(cv2.cvtColor(bin_img, cv2.COLOR_GRAY2BGR))
    mode = "light_preprocess"

    if not results:
        _th, otsu = cv2.threshold(contrast, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        results = ocr_read_numpy(cv2.cvtColor(otsu, cv2.COLOR_GRAY2BGR))
        stages.append("repli Otsu")
        mode = "light_otsu_fallback"

    if not results:
        results = ocr_read_numpy(cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR))
        stages.append("repli niveaux de gris")
        mode = "light_gray_fallback"

    confs = [float(r["confidence"]) for r in results]
    avg = sum(confs) / len(confs) if confs else 0.0
    return {
        "ocr_results": results,
        "preprocessing_stages": stages,
        "preprocessing_params": {"max_width": max_w, "resize_scale": round(scale, 4)},
        "ocr_avg_confidence": round(avg, 4),
        "pipeline_mode": mode,
    }


def ocr_texts_from_pipeline(pipeline_result: Dict[str, Any]) -> Tuple[List[str], List[float]]:
    """Extrait listes parallèles textes et confiances."""
    texts = []
    confs = []
    for r in pipeline_result.get("ocr_results") or []:
        texts.append(r.get("text", ""))
        confs.append(float(r.get("confidence", 0)))
    return texts, confs
