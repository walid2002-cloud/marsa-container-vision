"""
Router FastAPI pour le mode démo.

Expose des endpoints utilitaires pour le mode DETECTION_MODE=demo :
  - GET /demo/images : liste les images disponibles dans demo_images/
  - GET /demo/status : état du mode démo
"""

from fastapi import APIRouter
from app.services.demo_detector import get_demo_images_info, DEMO_IMAGES_DIR
import os

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/images")
async def list_demo_images():
    """Liste toutes les images de démonstration avec leurs infos caméra."""
    images = get_demo_images_info()
    return {
        "demo_images_dir": DEMO_IMAGES_DIR,
        "count": len(images),
        "images": images,
    }


@router.get("/status")
async def demo_status():
    """État du mode démo."""
    images = get_demo_images_info()
    return {
        "demo_available": os.path.isdir(DEMO_IMAGES_DIR),
        "images_count": len(images),
        "images_dir": DEMO_IMAGES_DIR,
        "cameras_mapped": [img["camera_name"] for img in images],
    }
