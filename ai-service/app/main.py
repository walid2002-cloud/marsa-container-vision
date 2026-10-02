"""
Application FastAPI — Service IA de détection de conteneurs.

Modes de fonctionnement :
  - "mock" : simulation à partir d'une liste prédéfinie
  - "demo" : analyse OCR sur images locales (dossier demo_images/)
  - "real" : pipeline YOLO + OCR sur flux RTSP (futur)

Le mode est contrôlé par la variable d'environnement DETECTION_MODE.
"""

import json
import logging
import os
import shutil
from logging import StreamHandler

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import DETECTION_MODE
from app.routers.cameras import router as cameras_router
from app.routers.demo import router as demo_router
from app.routers.detection import router as detection_router
from app.routers.experimental import router as experimental_router
from app.routers.jobs import router as jobs_router
from app.routers.vision import router as vision_router

DEMO_IMAGES_DIR = os.getenv("DEMO_IMAGES_DIR", "/app/demo_images")
RESULTS_DIR = os.getenv("RESULTS_DIR", "/app/results")


class JsonLogFormatter(logging.Formatter):
    """Logs structurés (une ligne JSON) pour agrégation type Loki."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "time": self.formatTime(record, self.datefmt),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _setup_logging() -> None:
    root = logging.getLogger()
    if os.getenv("JSON_LOGS", "false").lower() in ("1", "true", "yes"):
        h = StreamHandler()
        h.setFormatter(JsonLogFormatter())
        root.handlers.clear()
        root.addHandler(h)
        root.setLevel(logging.INFO)
    else:
        logging.basicConfig(level=logging.INFO)


_setup_logging()
log = logging.getLogger("marsa.ai")

app = FastAPI(
    title="Marsa Maroc — Service IA (Container Vision)",
    description=(
        "Service de détection de conteneurs par analyse d'images. "
        f"Mode actuel : {DETECTION_MODE}."
    ),
    version="1.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detection_router)
app.include_router(experimental_router)
app.include_router(demo_router)
app.include_router(cameras_router)
app.include_router(vision_router)
app.include_router(jobs_router)

os.makedirs(RESULTS_DIR, exist_ok=True)
if os.path.isdir(DEMO_IMAGES_DIR):
    app.mount("/demo_images", StaticFiles(directory=DEMO_IMAGES_DIR), name="demo_images")
if os.path.isdir(RESULTS_DIR):
    app.mount("/results", StaticFiles(directory=RESULTS_DIR), name="results")


@app.get("/health")
async def health():
    """État de santé du service IA."""
    demo_count = 0
    if os.path.isdir(DEMO_IMAGES_DIR):
        supported = {".jpg", ".jpeg", ".png", ".bmp", ".tiff"}
        demo_count = sum(
            1 for f in os.listdir(DEMO_IMAGES_DIR)
            if os.path.splitext(f)[1].lower() in supported
        )

    from app.services import yolo_service

    return {
        "status": "ok",
        "service": "marsa-ai-service",
        "detection_mode": DETECTION_MODE,
        "demo_available": DETECTION_MODE == "demo" or demo_count > 0,
        "demo_images_count": demo_count,
        "experimental_available": True,
        "cameras_connected": DETECTION_MODE == "real",
        "yolo_enabled": yolo_service.is_yolo_enabled(),
        "celery_enabled": os.getenv("CELERY_ENABLED", "false").lower() in ("1", "true", "yes"),
        "redis_url_set": bool(os.getenv("REDIS_URL")),
    }


@app.get("/ready")
async def ready():
    """
    Vérifications détaillées pour orchestration (Kubernetes / load balancer).
    """
    demo_count = 0
    if os.path.isdir(DEMO_IMAGES_DIR):
        supported = {".jpg", ".jpeg", ".png", ".bmp", ".tiff"}
        demo_count = sum(
            1 for f in os.listdir(DEMO_IMAGES_DIR)
            if os.path.splitext(f)[1].lower() in supported
        )

    checks = {
        "fastapi": True,
        "detection_mode": DETECTION_MODE,
        "demo_images_dir_exists": os.path.isdir(DEMO_IMAGES_DIR),
        "demo_images_count": demo_count,
        "results_dir_exists": os.path.isdir(RESULTS_DIR),
    }

    try:
        import easyocr  # noqa: F401

        checks["easyocr_import"] = True
    except Exception as e:
        checks["easyocr_import"] = False
        checks["easyocr_error"] = str(e)

    checks["yolo_import"] = False
    checks["yolo_model_ready"] = False
    try:
        from ultralytics import YOLO  # noqa: F401

        checks["yolo_import"] = True
        from app.services import yolo_service

        if yolo_service.is_yolo_enabled():
            from app.services.experimental_yolo import is_model_available

            checks["yolo_model_ready"] = bool(is_model_available())
        else:
            checks["yolo_model_ready"] = None
    except Exception as e:
        checks["yolo_error"] = str(e)

    checks["opencv_import"] = False
    try:
        import cv2  # noqa: F401

        checks["opencv_import"] = True
    except Exception as e:
        checks["opencv_error"] = str(e)

    checks["redis_ping"] = None
    if os.getenv("REDIS_URL"):
        try:
            import redis

            r = redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
            r.ping()
            checks["redis_ping"] = True
        except Exception as e:
            checks["redis_ping"] = False
            checks["redis_error"] = str(e)

    checks["celery_workers"] = None
    if os.getenv("CELERY_ENABLED", "").lower() in ("1", "true", "yes"):
        try:
            from app.celery_worker import celery_app

            insp = celery_app.control.inspect(timeout=1.0)
            ping = insp.ping() if insp else None
            checks["celery_workers"] = bool(ping)
        except Exception as e:
            checks["celery_workers"] = False
            checks["celery_error"] = str(e)

    try:
        du = shutil.disk_usage("/")
        checks["disk_free_gb"] = round(du.free / (1024**3), 2)
        checks["disk_ok"] = du.free > 256 * 1024 * 1024
    except Exception as e:
        checks["disk_ok"] = False
        checks["disk_error"] = str(e)

    try:
        from app.services import rtsp_reader

        checks["rtsp_sources"] = rtsp_reader.rtsp_sources_status()
    except Exception as e:
        checks["rtsp_sources"] = []
        checks["rtsp_error"] = str(e)

    ready_ok = (
        checks["demo_images_dir_exists"]
        and checks["easyocr_import"]
        and checks["opencv_import"]
        and checks.get("results_dir_exists", True)
        and checks.get("disk_ok", True)
    )
    checks["ready"] = ready_ok
    return checks


@app.on_event("startup")
async def startup_event():
    log.info("Démarrage service IA mode=%s", DETECTION_MODE)
    if DETECTION_MODE == "mock":
        log.info("Mode simulation actif.")
    elif DETECTION_MODE == "demo":
        log.info("Mode DEMO dossier=%s", DEMO_IMAGES_DIR)
        if os.path.isdir(DEMO_IMAGES_DIR):
            supported = {".jpg", ".jpeg", ".png", ".bmp", ".tiff"}
            count = sum(1 for f in os.listdir(DEMO_IMAGES_DIR) if os.path.splitext(f)[1].lower() in supported)
            log.info("%s image(s) de démonstration.", count)
        else:
            log.warning("Dossier demo_images absent : %s", DEMO_IMAGES_DIR)
        log.info("EasyOCR chargé au premier appel de détection.")
        try:
            from app.services.experimental_ocr import get_reader

            get_reader()
            log.info("EasyOCR prêt (préchargement au démarrage).")
        except Exception as e:
            log.warning("Préchargement EasyOCR : %s", e)
        try:
            from app.services import yolo_service

            if yolo_service.is_yolo_enabled():
                from app.services.experimental_yolo import is_model_available

                if is_model_available():
                    log.info("YOLO prêt (préchargement au démarrage).")
        except Exception as e:
            log.warning("Préchargement YOLO : %s", e)
        try:
            from app.services.demo_index_service import validate_demo_containers_at_startup

            validate_demo_containers_at_startup()
        except Exception as e:
            log.warning("Validation demo_containers.json : %s", e)
    else:
        log.info("Mode réel (YOLO + OCR + RTSP).")

    if os.getenv("RTSP_MONITOR_ENABLED", "false").lower() in ("1", "true", "yes"):
        try:
            from app.services import rtsp_reader

            rtsp_reader.start_rtsp_monitors_background()
            log.info("Moniteurs RTSP démarrés (RTSP_MONITOR_ENABLED).")
        except Exception as e:
            log.warning("RTSP monitors : %s", e)
