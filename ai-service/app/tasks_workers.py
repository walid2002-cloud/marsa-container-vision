"""
Tâches Celery : détection complète, tick OCR-only, tick YOLO-only (soutenance / scalabilité).
"""

from __future__ import annotations

from typing import Any, Dict

from app.celery_worker import celery_app


@celery_app.task(bind=True, name="marsa.tasks.full_detection")
def task_full_detection(self, container_code: str) -> Dict[str, Any]:
    """Pipeline complet (mock / demo / real) — même logique que POST /detect."""
    self.update_state(state="PROCESSING", meta={"step": "detect"})
    from app.services.detector import detect_container

    res = detect_container(container_code)
    return res.model_dump(mode="json")


@celery_app.task(bind=True, name="marsa.tasks.yolo_roi")
def task_yolo_roi(self, image_path: str) -> Dict[str, Any]:
    """Inférence YOLO seule (ROI) pour tests ou pré-chargement."""
    self.update_state(state="PROCESSING", meta={"step": "yolo"})
    from app.services import yolo_service

    bbox, conf, dets = yolo_service.select_best_roi(image_path)
    return {
        "bbox": bbox,
        "confidence": conf,
        "detections": dets,
    }


@celery_app.task(bind=True, name="marsa.tasks.ocr_path")
def task_ocr_path(self, image_path: str) -> Dict[str, Any]:
    """OCR sur fichier image (prétraitement + EasyOCR)."""
    self.update_state(state="PROCESSING", meta={"step": "ocr"})
    from app.services.ocr_service import run_ocr_pipeline_on_path

    return run_ocr_pipeline_on_path(image_path)


@celery_app.task(bind=True, name="marsa.tasks.rtsp_tick")
def task_rtsp_tick(self, camera_id: str) -> Dict[str, Any]:
    """Une capture RTSP pour une caméra (utilisable en beat périodique)."""
    self.update_state(state="PROCESSING", meta={"step": "rtsp"})
    from app.services import rtsp_reader

    frame = rtsp_reader.capture_frame(camera_id)
    return {
        "camera_id": camera_id,
        "got_frame": frame is not None,
        "shape": list(frame.shape) if frame is not None else None,
    }
