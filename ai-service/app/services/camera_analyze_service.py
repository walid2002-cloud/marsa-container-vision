"""
Analyse OCR (+ YOLO optionnel) d'une image caméra simulée (démo).

Utilise le pipeline expérimental (static_pipeline), plus stable en mémoire
que le scan multi-images de demo_detector.
"""

import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.services.camera_registry import get_camera_by_id, list_cameras_public
from app.services.demo_detector import DEMO_IMAGES_DIR, touch_last_analysis
from app.services.static_pipeline import run_ocr_pipeline, run_yolo_ocr_pipeline
from app.services import yolo_service
from app.services.camera_frame_simulator import get_current_frame, cache_frame_analysis


def _map_pipeline_result(
    pipeline: Dict[str, Any],
    camera_meta: dict,
    img_file: str,
) -> Dict[str, Any]:
    extracted = pipeline.get("extracted_codes") or []
    best_code = extracted[0]["normalized_code"] if extracted else None
    yolo_dets = pipeline.get("yolo_detections") or []
    yolo_bbox_used = pipeline.get("yolo_detection_count", 0) > 0
    ocr_lines = pipeline.get("ocr_on_full_image") or pipeline.get("ocr_detections") or []
    ocr_avg = None
    if ocr_lines:
        ocr_avg = sum(float(r.get("confidence") or 0) for r in ocr_lines) / len(ocr_lines)

    return {
        "camera_id": camera_meta.get("id"),
        "camera_name": camera_meta.get("name") or camera_meta.get("id"),
        "zone": camera_meta.get("zone"),
        "status": camera_meta.get("status", "active"),
        "demo_image": img_file,
        "image_url": f"/demo_images/{img_file}",
        "extracted_codes": extracted,
        "last_container": best_code,
        "confidence": round(ocr_avg, 4) if ocr_avg is not None and extracted else None,
        "ocr_used": True,
        "ocr_avg_confidence": round(ocr_avg, 4) if ocr_avg is not None else None,
        "yolo_enabled": yolo_service.is_yolo_enabled(),
        "yolo_used": yolo_bbox_used,
        "yolo_detected": yolo_bbox_used,
        "yolo_detection_count": pipeline.get("yolo_detection_count", len(yolo_dets)),
        "yolo_detections": yolo_dets,
        "pipeline_mode": pipeline.get("pipeline_mode", "ocr_only"),
        "analyzed_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "processing_time_ms": pipeline.get("processing_time_ms"),
        "warnings": pipeline.get("warnings") or [],
        # Phase 5 : champs OCR avancés + placeholders YOLO (issus de static_pipeline)
        "raw_ocr_text": pipeline.get("raw_ocr_text"),
        "normalized_codes": pipeline.get("normalized_codes"),
        "ocr_quality": pipeline.get("ocr_quality"),
        "partial_code_detected": pipeline.get("partial_code_detected"),
        "container_detected": pipeline.get("container_detected"),
        "code_area_detected": pipeline.get("code_area_detected"),
        "orientation": pipeline.get("orientation", "unknown"),
        "door_detected": pipeline.get("door_detected"),
        "seal_detected": pipeline.get("seal_detected"),
        "yolo_model_mode": pipeline.get("yolo_model_mode"),
        "message": (
            f"Dernier code lisible : {best_code}" if best_code else "Aucun code conteneur lisible sur cette image."
        ),
    }


def analyze_camera(camera_id: str) -> Optional[Dict[str, Any]]:
    cam = get_camera_by_id(camera_id)
    if not cam:
        return None

    frame = get_current_frame(camera_id)
    if frame and frame.get("local_path") and os.path.isfile(frame["local_path"]):
        img_path = frame["local_path"]
        demo_img = frame.get("filename") or cam.get("demo_image")
    else:
        demo_img = cam.get("demo_image")
        if not demo_img:
            return None
        img_path = os.path.join(DEMO_IMAGES_DIR, demo_img)
        if not os.path.isfile(img_path):
            return None

    if yolo_service.is_yolo_enabled():
        pipeline = run_yolo_ocr_pipeline(img_path, search_code=None)
    else:
        pipeline = run_ocr_pipeline(img_path, search_code=None)

    result = _map_pipeline_result(pipeline, cam, demo_img)
    result["frame_index"] = frame.get("index") if frame else 0
    result["frame_count"] = frame.get("frame_count") if frame else 1
    result["frame_source"] = frame.get("source") if frame else "demo"
    cache_frame_analysis(camera_id, demo_img, pipeline.get("extracted_codes") or [])
    touch_last_analysis(camera_id)
    return result


def scan_all_cameras(active_only: bool = True) -> Dict[str, Any]:
    cameras = list_cameras_public()
    results: List[Dict[str, Any]] = []
    for cam in cameras:
        if active_only and cam.get("status") != "active":
            continue
        cid = cam.get("id")
        if not cid:
            continue
        row = analyze_camera(cid)
        if row:
            results.append(row)
    return {
        "scanned_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "cameras_scanned": len(results),
        "yolo_enabled": yolo_service.is_yolo_enabled(),
        "results": results,
    }
