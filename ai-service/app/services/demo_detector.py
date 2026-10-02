"""
Détecteur en mode DEMO — analyse d'images locales avec prétraitement + OCR.

Pipeline :
  1. (Optionnel) YOLOv8 — ROI « zone utile » avant OCR (YOLO_ENABLED=true)
  2. Prétraitement OpenCV + EasyOCR sur la ROI ou sur l’image complète
  3. Extraction codes + comparaison
  4. Score global OCR + YOLO (pondéré) + image preuve annotée
"""

import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.models.schemas import DetectionResponse
from app.services.code_extractor import extract_container_codes, match_code
from app.services.fuzzy_match_service import (
    classify_search_code,
    get_last_match_debug,
    map_internal_match_type_to_api,
)
from app.services.iso_focused_ocr import augment_ocr_with_iso_focused_pass
from app.services.ocr_service import (
    run_ocr_pipeline_on_path,
    run_ocr_pipeline_on_numpy,
    ocr_texts_from_pipeline,
)
from app.services.camera_registry import (
    get_camera_info_for_image,
    touch_last_analysis,
    load_camera_registry,
    get_last_analysis_time,
    get_camera_by_id,
)
from app.services.annotation_service import build_evidence_image
from app.services import yolo_service
from app.services import yolo_model_manager
from app.services.ocr_quality import build_ocr_summary

DEMO_IMAGES_DIR = os.getenv("DEMO_IMAGES_DIR", "/app/demo_images")

_CONF_THRESHOLD = float(os.getenv("DETECTION_CONFIDENCE_THRESHOLD", "0.5"))

MSG_NO_OCR_MATCH = (
    "Aucun conteneur correspondant au code demandé n'a été détecté."
)

log = logging.getLogger("marsa.demo")


def _debug_match_str(d: Dict[str, Any]) -> str:
    if not d:
        return "no_debug"
    parts = [f"reason={d.get('reason')}"]
    if d.get("requested"):
        parts.append(f"requested_norm={d.get('requested')}")
    if d.get("target"):
        parts.append(f"target={d.get('target')}")
    if d.get("target_kind"):
        parts.append(f"target_kind={d.get('target_kind')}")
    if d.get("best_cand") is not None:
        parts.append(f"best_cand={d.get('best_cand')!r} score={d.get('best_score')}")
    if d.get("extracted") is not None:
        parts.append(f"ocr_normalized={d.get('extracted')}")
    if d.get("scan_context"):
        parts.append(f"image={d.get('scan_context')}")
    return " | ".join(str(p) for p in parts)


def _match_response_fields(
    *,
    display_code: str,
    matched: Optional[dict],
    image_path_val: Optional[str],
    evidence_url: Optional[str],
    rejection_detail: Optional[str] = None,
    rejected_candidates: Optional[List[Any]] = None,
) -> Dict[str, Any]:
    base: Dict[str, Any] = {
        "requested_code": display_code,
        "detected_code": None,
        "matched_image": None,
        "match_type": "none",
        "similarity_score": None,
        "exact_match": False,
        "fuzzy_match": False,
        "match_rejection_reason": rejection_detail,
        "matched_candidate": None,
        "rejected_candidates": rejected_candidates,
    }
    if matched:
        base["detected_code"] = matched.get("normalized_code")
        base["matched_candidate"] = matched.get("matched_candidate") or matched.get(
            "normalized_code"
        )
        base["matched_image"] = image_path_val or evidence_url
        base["match_type"] = map_internal_match_type_to_api(matched.get("match_type"))
        base["similarity_score"] = matched.get("similarity_score")
        base["exact_match"] = bool(matched.get("exact_match"))
        base["fuzzy_match"] = bool(matched.get("fuzzy_match"))
        base["match_rejection_reason"] = None
        base["rejected_candidates"] = matched.get("rejected_candidates")
    return base


def _list_demo_images() -> List[str]:
    supported = {".jpg", ".jpeg", ".png", ".bmp", ".tiff"}
    images = []
    if not os.path.isdir(DEMO_IMAGES_DIR):
        print(f"[DEMO] Dossier {DEMO_IMAGES_DIR} non trouvé.")
        return images
    for f in sorted(os.listdir(DEMO_IMAGES_DIR)):
        if Path(f).suffix.lower() in supported:
            images.append(f)
    return images


def get_demo_images_info() -> List[dict]:
    load_camera_registry()
    images = _list_demo_images()
    result = []
    for img in images:
        info = get_camera_info_for_image(img)
        result.append({
            "filename": img,
            "camera_id": info.get("camera_id"),
            "camera_name": info["camera_name"],
            "zone": info["zone"],
            "status": info.get("status", "active"),
            "path": os.path.join(DEMO_IMAGES_DIR, img),
        })
    return result


def _phase5_fields(
    *,
    search_normalized: str,
    extracted: List[dict],
    matched: Optional[dict],
    ocr_texts: List[str],
    ocr_avg: float,
    global_score: float,
    used_yolo: bool,
    yolo_bbox: Optional[dict],
    yolo_conf: float,
) -> Dict[str, Any]:
    """
    Champs OCR avancés + placeholders YOLO conteneurs (Phase 5).

    Note : ``match_type`` est déjà fourni par ``_match_response_fields`` ; on le
    retire ici pour éviter une collision de mot-clé lors du ``**`` spread.
    """
    summary = build_ocr_summary(
        search_normalized=search_normalized,
        extracted_codes=extracted,
        matched=matched,
        ocr_texts=ocr_texts,
        ocr_avg=ocr_avg,
        global_score=global_score,
    )
    summary.pop("match_type", None)
    summary.pop("had_ocr_corrections", None)

    yolo_detected = bool(used_yolo and yolo_bbox)
    yolo = yolo_model_manager.placeholder_fields(
        yolo_detected=yolo_detected if yolo_detected else None,
        yolo_confidence=yolo_conf if yolo_detected else None,
    )
    # yolo_confidence est déjà porté par le champ dédié du DetectionResponse.
    yolo.pop("yolo_confidence", None)
    summary.update(yolo)
    return summary


def _compute_global_score(ocr_avg: float, yolo_part: Optional[float] = None) -> float:
    ocr_c = max(0.0, min(1.0, float(ocr_avg)))
    if yolo_part is None:
        return round(min(0.99, ocr_c), 4)
    y = max(0.0, min(1.0, float(yolo_part)))
    return round(min(0.99, 0.75 * ocr_c + 0.25 * y), 4)


def _run_pipeline_for_image(
    img_path: str,
) -> Tuple[dict, List[str], List[float], bool, Optional[dict], float, Optional[np.ndarray]]:
    """
    Retourne (pipe, texts, confs, used_yolo_roi, yolo_bbox_expanded, yolo_conf, ocr_bgr).

    ``ocr_bgr`` : image BGR réellement passée à EasyOCR (crop YOLO si ROI utilisée,
    sinon ``None`` — le caller peut ``imread`` le chemin complet pour une passe ISO ciblée).
    """
    used_yolo = False
    yolo_bbox: Optional[dict] = None
    yolo_conf = 0.0

    if yolo_service.is_yolo_enabled():
        bbox, yconf, _dets = yolo_service.select_best_roi(img_path)
        yolo_conf = yconf
        if bbox:
            try:
                crop = yolo_service.crop_bgr(img_path, bbox)
                if crop.size == 0:
                    raise ValueError("crop vide")
                pipe = run_ocr_pipeline_on_numpy(crop)
                used_yolo = True
                yolo_bbox = bbox
                ocr_texts, ocr_confs = ocr_texts_from_pipeline(pipe)
                if ocr_texts:
                    return pipe, ocr_texts, ocr_confs, used_yolo, yolo_bbox, yolo_conf, crop
                print("[DEMO] ROI YOLO sans texte OCR — fallback plein cadre.")
            except Exception as e:
                print(f"[DEMO] ROI YOLO / OCR crop : {e} — fallback plein cadre.")

    pipe = run_ocr_pipeline_on_path(img_path)
    ocr_texts, ocr_confs = ocr_texts_from_pipeline(pipe)
    return pipe, ocr_texts, ocr_confs, used_yolo, yolo_bbox, yolo_conf, None


def demo_detect(normalized_search: str, display_code: str) -> DetectionResponse:
    images = _list_demo_images()
    print(f"\n[DEMO] === Recherche '{display_code}' (normalisé: '{normalized_search}') ===")
    print(f"[DEMO] {len(images)} image(s) dans {DEMO_IMAGES_DIR}")
    print(f"[DEMO] YOLO_ENABLED={yolo_service.is_yolo_enabled()}")
    log.info("[DEMO][ocr] début scan images (index démo sans match ou complément OCR)")

    if not images:
        mf = _match_response_fields(
            display_code=display_code,
            matched=None,
            image_path_val=None,
            evidence_url=None,
            rejection_detail="no_demo_images",
        )
        return DetectionResponse(
            searched_code=display_code,
            detected=False,
            message="Aucune image de démonstration disponible. Ajoutez des images dans demo_images/.",
            camera_name=None,
            zone=None,
            confidence=0.0,
            image_path=None,
            detected_at=None,
            global_confidence=0.0,
            yolo_confidence=None,
            detection_status="ok",
            yolo_detected=False,
            ocr_confidence=None,
            evidence_image_url=None,
            annotated_image_url=None,
            source_match="none",
            **mf,
        )
    last_reject_debug: Dict[str, Any] = {}
    start_time = time.time()
    agg_texts: List[str] = []
    agg_extracted: List[dict] = []
    best_ocr_avg = 0.0

    for img_file in images:
        img_path = os.path.join(DEMO_IMAGES_DIR, img_file)
        cam = get_camera_info_for_image(img_file)
        print(f"\n[DEMO] --- {img_file} ({cam['camera_name']}, {cam['zone']}) ---")
        log.info(
            "[DEMO][scan] requested=%r normalized=%r image=%s",
            display_code,
            normalized_search,
            img_file,
        )

        try:
            pipe, ocr_texts, ocr_confs, used_yolo, yolo_bbox, yolo_conf, ocr_bgr = _run_pipeline_for_image(
                img_path
            )
        except Exception as e:
            print(f"[DEMO] Erreur pipeline OCR : {e}")
            log.warning("[DEMO][ocr_error] image=%s err=%s", img_file, e)
            continue

        print(f"[DEMO] Prétraitement : {pipe.get('pipeline_mode')} | étapes: {pipe.get('preprocessing_stages')}")
        print(f"[DEMO] OCR lignes: {len(ocr_texts)} | confiance moyenne pipeline: {pipe.get('ocr_avg_confidence')}")

        for i, (txt, conf) in enumerate(zip(ocr_texts, ocr_confs)):
            print(f"[DEMO]   [{i+1}] '{txt}' ({conf:.2f})")

        ocr_results = list(pipe.get("ocr_results") or [])
        work_bgr = ocr_bgr if ocr_bgr is not None else cv2.imread(img_path, cv2.IMREAD_COLOR)
        if work_bgr is not None and classify_search_code(normalized_search) == "ISO_CODE":
            prefix4 = normalized_search[:4]
            n0 = len(ocr_results)
            ocr_results = augment_ocr_with_iso_focused_pass(work_bgr, prefix4, ocr_results)
            if len(ocr_results) != n0:
                pipe["ocr_results"] = ocr_results
                ocr_texts = [str(r.get("text") or "") for r in ocr_results]
                ocr_confs = [float(r.get("confidence") or 0.0) for r in ocr_results]
                print(f"[DEMO] OCR après passe ISO ciblée : {len(ocr_texts)} détection(s)")

        iso_dbg: Dict[str, Any] = {}
        extracted = extract_container_codes(ocr_texts, ocr_results, iso_debug=iso_dbg)
        if classify_search_code(normalized_search) == "ISO_CODE":
            log.info(
                "[DEMO][iso] image=%s ocr_brut_lines=%s",
                img_file,
                ocr_texts if len(ocr_texts) <= 40 else f"{len(ocr_texts)} detections (truncated in logs)",
            )
            log.debug(
                "[DEMO][iso] fragments=%s | merged_h=%s | merged_v=%s | regex=%s | candidats=%s",
                iso_dbg.get("fragments"),
                iso_dbg.get("horizontal_merges"),
                iso_dbg.get("vertical_merges"),
                iso_dbg.get("regex_candidates"),
                [e.get("normalized_code") for e in extracted],
            )

        matched = match_code(extracted, normalized_search, scan_context=img_file)

        agg_texts.extend(ocr_texts)
        agg_extracted.extend(extracted)
        best_ocr_avg = max(best_ocr_avg, float(pipe.get("ocr_avg_confidence") or 0.0))

        if not matched:
            last_reject_debug = get_last_match_debug()
            log.warning(
                "[DEMO][reject] requested=%r image=%s ocr_raw=%s ocr_normalized=%s | %s",
                display_code,
                img_file,
                ocr_texts,
                [e.get("normalized_code") for e in extracted],
                _debug_match_str(last_reject_debug),
            )

        if extracted:
            print(f"[DEMO] Codes extraits (normalisés) : {[e['normalized_code'] for e in extracted]}")
        if matched:
            print(
                f"[DEMO] Matching : {matched.get('match_type')} | "
                f"exact_match={matched.get('exact_match')} fuzzy_match={matched.get('fuzzy_match')} "
                f"similarity_score={matched.get('similarity_score')} | {matched.get('match_detail')}"
            )
            log.info(
                "[DEMO][accept] requested=%r image=%s best=%r type=%s score=%s detail=%s",
                display_code,
                img_file,
                matched.get("normalized_code"),
                matched.get("match_type"),
                matched.get("similarity_score"),
                matched.get("match_detail"),
            )

        yolo_part = yolo_conf if (used_yolo and yolo_bbox) else None
        ocr_avg = float(pipe.get("ocr_avg_confidence") or 0.0)
        if matched and ocr_confs:
            ocr_avg = sum(ocr_confs) / max(len(ocr_confs), 1)

        global_score = _compute_global_score(ocr_avg, yolo_part)

        bgr_full = cv2.imread(img_path, cv2.IMREAD_COLOR)
        ann_url = None
        if bgr_full is not None and matched:
            try:
                ann_path = build_evidence_image(
                    bgr_full,
                    camera_name=cam["camera_name"],
                    zone=cam["zone"],
                    yolo_bbox=yolo_bbox,
                    ocr_bbox=yolo_bbox,
                    detected_text=matched["raw_text"] if matched else None,
                    ocr_confidence=ocr_avg,
                    yolo_confidence=yolo_conf if yolo_bbox else 0.0,
                    global_confidence=global_score,
                    yolo_detected=bool(yolo_bbox),
                )
                ann_url = ann_path
            except Exception as e:
                print(f"[DEMO] Annotation : {e}")

        evidence_url = f"/demo_images/{img_file}"

        if matched:
            cid = cam.get("camera_id", cam["camera_name"])
            touch_last_analysis(cid)

            if global_score < _CONF_THRESHOLD:
                print(
                    f"[DEMO] Match OCR mais score global {global_score} < seuil {_CONF_THRESHOLD} "
                    f"→ low_confidence"
                )
                mf = _match_response_fields(
                    display_code=display_code,
                    matched=matched,
                    image_path_val=None,
                    evidence_url=None,
                    rejection_detail=f"global_below_threshold score={global_score:.3f}",
                    rejected_candidates=matched.get("rejected_candidates"),
                )
                p5 = _phase5_fields(
                    search_normalized=normalized_search,
                    extracted=extracted,
                    matched=matched,
                    ocr_texts=ocr_texts,
                    ocr_avg=ocr_avg,
                    global_score=global_score,
                    used_yolo=used_yolo,
                    yolo_bbox=yolo_bbox,
                    yolo_conf=yolo_conf,
                )
                return DetectionResponse(
                    searched_code=display_code,
                    detected=False,
                    message=(
                        f"Correspondance OCR faible confiance ({global_score:.0%}) "
                        f"pour '{matched['normalized_code']}' sur {img_file}. "
                        f"Seuil minimal : {_CONF_THRESHOLD:.0%}."
                    ),
                    camera_name=None,
                    zone=None,
                    confidence=round(ocr_avg, 4),
                    image_path=None,
                    detected_at=datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                    global_confidence=global_score,
                    yolo_confidence=yolo_part,
                    detection_status="low_confidence",
                    yolo_detected=bool(yolo_bbox),
                    ocr_confidence=round(ocr_avg, 4),
                    evidence_image_url=None,
                    annotated_image_url=None,
                    source_match="ocr",
                    **mf,
                    **p5,
                )
            elapsed = time.time() - start_time
            print(f"[DEMO] MATCH '{matched['normalized_code']}' | global={global_score} | {elapsed:.1f}s")

            mf = _match_response_fields(
                display_code=display_code,
                matched=matched,
                image_path_val=f"/demo_images/{img_file}",
                evidence_url=evidence_url,
            )
            p5 = _phase5_fields(
                search_normalized=normalized_search,
                extracted=extracted,
                matched=matched,
                ocr_texts=ocr_texts,
                ocr_avg=ocr_avg,
                global_score=global_score,
                used_yolo=used_yolo,
                yolo_bbox=yolo_bbox,
                yolo_conf=yolo_conf,
            )
            return DetectionResponse(
                searched_code=display_code,
                detected=True,
                message=f"Conteneur détecté par OCR dans l'image {img_file} ({cam['camera_name']})",
                camera_name=cam["camera_name"],
                zone=cam["zone"],
                confidence=round(ocr_avg, 4),
                image_path=f"/demo_images/{img_file}",
                detected_at=datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                global_confidence=global_score,
                yolo_confidence=yolo_part,
                detection_status="ok",
                yolo_detected=bool(yolo_bbox),
                ocr_confidence=round(ocr_avg, 4),
                evidence_image_url=evidence_url,
                annotated_image_url=ann_url,
                source_match="yolo" if (used_yolo and yolo_bbox) else "ocr",
                **mf,
                **p5,
            )
    elapsed = time.time() - start_time
    print(f"\n[DEMO] Aucune correspondance pour '{display_code}' ({elapsed:.1f}s)")

    mf = _match_response_fields(
        display_code=display_code,
        matched=None,
        image_path_val=None,
        evidence_url=None,
        rejection_detail=_debug_match_str(last_reject_debug),
        rejected_candidates=last_reject_debug.get("rejected_candidates"),
    )
    n_img = len(images)
    p5 = _phase5_fields(
        search_normalized=normalized_search,
        extracted=agg_extracted,
        matched=None,
        ocr_texts=agg_texts,
        ocr_avg=best_ocr_avg,
        global_score=0.0,
        used_yolo=False,
        yolo_bbox=None,
        yolo_conf=0.0,
    )
    return DetectionResponse(
        searched_code=display_code,
        detected=False,
        message=f"{MSG_NO_OCR_MATCH} ({n_img} image(s) analysée(s)).",
        camera_name=None,
        zone=None,
        confidence=0.0,
        image_path=None,
        detected_at=None,
        global_confidence=0.0,
        yolo_confidence=None,
        detection_status="ok",
        yolo_detected=False,
        ocr_confidence=None,
        evidence_image_url=None,
        annotated_image_url=None,
        source_match="none",
        images_analyzed=n_img,
        cameras_scanned=n_img,
        **mf,
        **p5,
    )


def get_latest_for_camera(camera_id: str) -> Optional[dict]:
    """Dernière image de démo et horodatage pour une caméra."""
    cam = get_camera_by_id(camera_id)
    if not cam:
        return None
    demo_img = cam.get("demo_image")
    if not demo_img:
        return None
    last = get_last_analysis_time(camera_id)
    return {
        "camera_id": camera_id,
        "demo_image": demo_img,
        "image_url": f"/demo_images/{demo_img}" if demo_img else None,
        "last_analysis_time": last,
        "zone": cam.get("zone"),
        "status": cam.get("status", "active"),
    }
