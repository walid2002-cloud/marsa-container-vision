"""Analyse d'images uploadées (OCR + extraction codes)."""

import asyncio
from typing import Any, Dict, Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.code_extractor import (
    extract_container_codes,
    match_code as match_container_code,
    normalize_code,
)
from app.services.fuzzy_match_service import classify_search_code
from app.services.iso_focused_ocr import augment_ocr_with_iso_focused_pass
from app.services.image_util import resize_bgr_max
from app.services.ocr_service import run_ocr_pipeline_on_numpy, ocr_texts_from_pipeline

router = APIRouter(prefix="/vision", tags=["vision"])


def _analyze_bgr(bgr: np.ndarray, match_code: Optional[str], filename: str) -> Dict[str, Any]:
    bgr = resize_bgr_max(bgr)
    pipe = run_ocr_pipeline_on_numpy(bgr)
    texts, confs = ocr_texts_from_pipeline(pipe)
    ocr_results = list(pipe.get("ocr_results") or [])
    match_normalized = normalize_code(match_code) if match_code else None
    if match_normalized and classify_search_code(match_normalized) == "ISO_CODE":
        ocr_results = augment_ocr_with_iso_focused_pass(bgr, match_normalized[:4], ocr_results)
        pipe["ocr_results"] = ocr_results
        texts = [str(r.get("text") or "") for r in ocr_results]
        confs = [float(r.get("confidence") or 0.0) for r in ocr_results]

    iso_dbg: Dict[str, Any] = {}
    extracted = extract_container_codes(texts, ocr_results, iso_debug=iso_dbg)
    ctx = filename or "upload"
    matched = (
        match_container_code(extracted, match_normalized, scan_context=ctx)
        if match_normalized
        else None
    )

    return {
        "extracted_codes": extracted,
        "ocr_line_count": len(texts),
        "ocr_avg_confidence": pipe.get("ocr_avg_confidence"),
        "preprocessing_stages": pipe.get("preprocessing_stages"),
        "pipeline_mode": pipe.get("pipeline_mode"),
        "match_requested": match_normalized,
        "match_found": matched is not None,
        "sample_ocr_lines": [{"text": t, "confidence": c} for t, c in zip(texts[:20], confs[:20])],
        "iso_spatial_debug": iso_dbg or None,
    }


@router.post("/analyze-upload")
async def analyze_upload(
    file: UploadFile = File(...),
    match_code: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """
    Analyse une image : prétraitement + OCR + extraction des codes conteneur.

    - match_code (optionnel) : si fourni, indique si ce code apparaît dans l'OCR.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Fichier image requis (image/jpeg, image/png, …).")

    raw = await file.read()
    max_bytes = 40 * 1024 * 1024
    if not raw or len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail="Image vide ou trop volumineuse (max 40 Mo).")

    arr = np.frombuffer(raw, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status_code=400, detail="Impossible de décoder l'image.")

    try:
        return await asyncio.to_thread(_analyze_bgr, bgr, match_code, file.filename or "upload")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur pipeline OCR : {e}") from e
