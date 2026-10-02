"""
Pipeline expérimental de détection sur image fixe.

Ce module orchestre la détection de conteneurs sur une image statique
uploadée par l'utilisateur. Deux modes sont disponibles :

  1. "ocr_only"  — OCR directement sur l'image entière (mode actuel)
  2. "yolo_ocr"  — YOLO détecte les objets, crop, puis OCR sur les crops

Le mode "ocr_only" est fonctionnel et utilisable immédiatement.
Le mode "yolo_ocr" fonctionne mais avec le modèle générique yolov8n
(pas entraîné sur les conteneurs, résultats limités).

État : EXPÉRIMENTAL
  - OCR sur image entière : fonctionnel
  - YOLO détection générique : fonctionnel (modèle pré-entraîné COCO)
  - Pipeline combiné : fonctionnel mais non optimisé
  - Non validé sur des images réelles du terminal Marsa Maroc
"""

import time
import os
from typing import Optional
from datetime import datetime

from app.services.experimental_ocr import ocr_read_image
from app.services.experimental_yolo import detect_objects, crop_detection, is_model_available
from app.services.code_extractor import extract_container_codes, match_code, normalize_code
from app.services.ocr_service import run_ocr_pipeline_light_on_path, ocr_texts_from_pipeline
from app.services.fuzzy_match_service import (
    classify_search_code,
    map_internal_match_type_to_api,
)
from app.services.iso_focused_ocr import augment_ocr_with_iso_focused_pass
from app.services.ocr_quality import build_ocr_summary
from app.services import yolo_model_manager


def _phase5_block(search_code, extracted, match_result, ocr_texts, ocr_avg, *, yolo_detected=False, yolo_conf=None):
    """Bloc de champs OCR avancés + placeholders YOLO pour le pipeline image fixe."""
    search_norm = normalize_code(search_code) if search_code else None
    summary = build_ocr_summary(
        search_normalized=search_norm,
        extracted_codes=extracted,
        matched=match_result,
        ocr_texts=ocr_texts,
        ocr_avg=ocr_avg,
        match_type_api=(
            map_internal_match_type_to_api(match_result.get("match_type"))
            if match_result
            else "none"
        ),
    )
    summary.pop("had_ocr_corrections", None)
    yolo = yolo_model_manager.placeholder_fields(
        yolo_detected=yolo_detected if yolo_detected else None,
        yolo_confidence=yolo_conf,
    )
    summary.update(yolo)
    return summary


def run_ocr_pipeline(
    image_path: str,
    search_code: Optional[str] = None,
) -> dict:
    """
    Pipeline OCR seul : image → OCR → extraction codes.

    Exécute EasyOCR sur l'image entière, extrait les codes de conteneurs
    potentiels, et cherche une correspondance si un code est fourni.

    Args:
        image_path: Chemin vers l'image uploadée.
        search_code: Code conteneur à rechercher (optionnel).

    Returns:
        Dict avec les résultats complets du pipeline.
    """
    start = time.time()
    warnings = []

    # Phase 5 : prétraitement OpenCV avancé (grayscale, resize, denoise, CLAHE,
    # binarisation adaptative, variante Otsu) au lieu de l'OCR brut.
    pipe = run_ocr_pipeline_light_on_path(image_path)
    ocr_results = list(pipe.get("ocr_results") or [])
    ocr_texts, ocr_confs = ocr_texts_from_pipeline(pipe)
    ocr_avg = pipe.get("ocr_avg_confidence")

    search_norm = normalize_code(search_code) if search_code else None
    extracted = extract_container_codes(ocr_texts, ocr_results)

    match_result = None
    if search_code:
        ctx = os.path.basename(image_path) if image_path else "static"
        match_result = match_code(extracted, search_norm or search_code, scan_context=ctx)

    elapsed = round((time.time() - start) * 1000, 1)

    if not ocr_results:
        warnings.append("Aucun texte détecté par l'OCR dans l'image.")
    if not extracted:
        warnings.append("Aucun code de conteneur trouvé dans les textes détectés.")

    p5 = _phase5_block(search_code, extracted, match_result, ocr_texts, ocr_avg)

    return {
        "experimental": True,
        "pipeline_mode": "ocr_only",
        "ocr_detections": ocr_results,
        "extracted_codes": extracted,
        "searched_code": search_code,
        "match_found": match_result is not None,
        "matched_text": match_result["raw_text"] if match_result else None,
        "ocr_avg_confidence": ocr_avg,
        "preprocessing_stages": pipe.get("preprocessing_stages"),
        "processing_time_ms": elapsed,
        "message": _build_message(match_result, search_code, extracted),
        "warnings": warnings,
        "timestamp": datetime.now().isoformat(),
        **p5,
    }


def run_yolo_ocr_pipeline(
    image_path: str,
    search_code: Optional[str] = None,
    output_dir: str = "/app/test_outputs",
) -> dict:
    """
    Pipeline YOLO + OCR : image → YOLO → crop → OCR → extraction codes.

    Exécute YOLO pour détecter les objets, crop chaque détection,
    puis exécute l'OCR sur chaque crop.

    IMPORTANT : le modèle yolov8n (COCO) ne détecte PAS les conteneurs
    spécifiquement. Les résultats YOLO sont informatifs mais le crop
    ciblé n'est pas encore pertinent sans modèle custom.

    Args:
        image_path: Chemin vers l'image uploadée.
        search_code: Code conteneur à rechercher (optionnel).
        output_dir: Répertoire pour sauvegarder les crops.

    Returns:
        Dict avec les résultats complets du pipeline.
    """
    start = time.time()
    warnings = [
        "Le modèle YOLO utilisé (yolov8n) est générique (COCO). "
        "Il ne détecte pas spécifiquement les conteneurs maritimes."
    ]

    yolo_results = detect_objects(image_path)
    yolo_conf = max((float(d.get("confidence", 0.0)) for d in yolo_results), default=0.0)

    # Phase 5 : OCR plein cadre via le prétraitement allégé (borné mémoire).
    full_pipe = run_ocr_pipeline_light_on_path(image_path)
    ocr_on_full = list(full_pipe.get("ocr_results") or [])
    ocr_texts_full = [r["text"] for r in ocr_on_full]
    full_ocr_avg = full_pipe.get("ocr_avg_confidence")

    crop_ocr_results = []
    os.makedirs(output_dir, exist_ok=True)

    for i, det in enumerate(yolo_results):
        crop_path = os.path.join(output_dir, f"crop_{i}_{det['class_name']}.jpg")
        try:
            crop_detection(image_path, det["bbox"], crop_path)
            crop_ocr = ocr_read_image(crop_path)
            crop_ocr_results.append({
                "yolo_detection": det,
                "crop_path": crop_path,
                "ocr_on_crop": crop_ocr,
            })
        except Exception as e:
            warnings.append(f"Erreur crop #{i} ({det['class_name']}): {str(e)}")

    all_ocr_texts = list(ocr_texts_full)
    for cr in crop_ocr_results:
        all_ocr_texts.extend([r["text"] for r in cr["ocr_on_crop"]])

    extracted = extract_container_codes(all_ocr_texts)

    match_result = None
    if search_code:
        ctx = os.path.basename(image_path) if image_path else "static"
        match_result = match_code(extracted, search_code, scan_context=ctx)

    elapsed = round((time.time() - start) * 1000, 1)

    if not ocr_on_full and not crop_ocr_results:
        warnings.append("Aucun texte détecté dans l'image ni dans les crops.")

    p5 = _phase5_block(
        search_code,
        extracted,
        match_result,
        all_ocr_texts,
        full_ocr_avg,
        yolo_detected=len(yolo_results) > 0,
        yolo_conf=yolo_conf if yolo_results else None,
    )

    return {
        "experimental": True,
        "pipeline_mode": "yolo_ocr",
        "yolo_detections": yolo_results,
        "yolo_detection_count": len(yolo_results),
        "crop_ocr_results": crop_ocr_results,
        "ocr_on_full_image": ocr_on_full,
        "extracted_codes": extracted,
        "searched_code": search_code,
        "match_found": match_result is not None,
        "matched_text": match_result["raw_text"] if match_result else None,
        "ocr_avg_confidence": full_ocr_avg,
        "preprocessing_stages": full_pipe.get("preprocessing_stages"),
        "processing_time_ms": elapsed,
        "message": _build_message(match_result, search_code, extracted),
        "warnings": warnings,
        "timestamp": datetime.now().isoformat(),
        **p5,
    }


def _build_message(
    match_result: Optional[dict],
    search_code: Optional[str],
    extracted: list,
) -> str:
    if search_code and match_result:
        return f"Code '{search_code}' trouvé dans l'image (texte lu : '{match_result['raw_text']}')"
    if search_code:
        codes_str = ", ".join(c["normalized_code"] for c in extracted[:5])
        if codes_str:
            return f"Code '{search_code}' non trouvé. Codes détectés : {codes_str}"
        return f"Code '{search_code}' non trouvé. Aucun code lisible dans l'image."
    if extracted:
        codes_str = ", ".join(c["normalized_code"] for c in extracted[:5])
        return f"{len(extracted)} code(s) détecté(s) : {codes_str}"
    return "Aucun code de conteneur détecté dans l'image."
