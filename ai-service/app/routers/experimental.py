"""
Routes expérimentales pour la détection sur image fixe.

Ces routes sont séparées de la route /detect existante.
Elles permettent de tester l'OCR et YOLO sur des images uploadées,
sans impacter le mode mock en production.

Routes :
  POST /experimental/detect-image  — pipeline OCR (ou YOLO+OCR) sur une image
  GET  /experimental/status        — état des services expérimentaux
"""

import os
import shutil
import tempfile
import asyncio
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.services.static_pipeline import run_ocr_pipeline, run_yolo_ocr_pipeline
from app.services.image_util import resize_image_file_inplace

router = APIRouter(prefix="/experimental", tags=["Expérimental"])


@router.post("/detect-image")
async def detect_image(
    file: UploadFile = File(..., description="Image à analyser (JPEG, PNG)"),
    container_code: Optional[str] = Form(None, description="Code conteneur à rechercher (optionnel)"),
    mode: Optional[str] = Form("ocr_only", description="Pipeline : 'ocr_only' ou 'yolo_ocr'"),
):
    """
    Analyse une image fixe pour détecter des identifiants de conteneurs.

    **Mode ocr_only** (par défaut) :
    Exécute EasyOCR sur l'image entière, extrait les codes de conteneurs
    potentiels via regex, et cherche une correspondance si un code est fourni.

    **Mode yolo_ocr** :
    Exécute YOLO pour détecter les objets, puis OCR sur l'image entière
    et sur chaque crop YOLO. Le modèle YOLO actuel (yolov8n) est
    générique et ne détecte pas spécifiquement les conteneurs.

    **EXPÉRIMENTAL** : ces résultats ne sont pas validés en production.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image (JPEG, PNG).")

    suffix = ".jpg" if "jpeg" in (file.content_type or "") else ".png"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir="/app/test_images")
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        resize_image_file_inplace(tmp.name)

        search = container_code.strip() if container_code else None

        if mode == "yolo_ocr":
            result = await asyncio.to_thread(run_yolo_ocr_pipeline, tmp.name, search)
        else:
            result = await asyncio.to_thread(run_ocr_pipeline, tmp.name, search)

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'analyse : {str(e)}")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


@router.get("/status")
async def experimental_status():
    """
    Retourne l'état des services expérimentaux (OCR, YOLO).
    """
    ocr_ok = False
    ocr_error = None
    try:
        from app.services.experimental_ocr import get_reader
        get_reader()
        ocr_ok = True
    except Exception as e:
        ocr_error = str(e)

    yolo_ok = False
    yolo_error = None
    yolo_model = None
    try:
        from app.services.experimental_yolo import is_model_available, _model_path
        yolo_ok = is_model_available()
        yolo_model = _model_path
    except Exception as e:
        yolo_error = str(e)

    return {
        "experimental": True,
        "ocr": {
            "engine": "easyocr",
            "available": ocr_ok,
            "error": ocr_error,
            "note": "OCR fonctionnel sur images fixes. Non validé sur images réelles Marsa Maroc.",
        },
        "yolo": {
            "model": yolo_model,
            "available": yolo_ok,
            "error": yolo_error,
            "note": (
                "Modèle yolov8n (COCO, 80 classes génériques). "
                "Ne détecte PAS les conteneurs maritimes spécifiquement. "
                "Un modèle custom entraîné est nécessaire."
            ),
        },
        "pipelines": {
            "ocr_only": "Fonctionnel — image → OCR → extraction codes",
            "yolo_ocr": "Expérimental — image → YOLO + OCR → extraction codes",
        },
    }
