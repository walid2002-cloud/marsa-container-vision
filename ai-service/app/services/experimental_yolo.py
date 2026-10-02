"""
Service YOLO expérimental pour la détection d'objets sur images fixes.

Ce module utilise YOLOv8 (ultralytics) pour détecter des objets dans
une image fixe. Le modèle utilisé est yolov8n (nano, pré-entraîné sur COCO).

IMPORTANT — Limites actuelles :
  - Le modèle yolov8n détecte 80 classes COCO génériques (voiture, camion, etc.)
  - Il ne détecte PAS spécifiquement les conteneurs maritimes
  - Il ne détecte PAS les zones de numéro sur les conteneurs
  - Pour une détection spécifique, il faut entraîner un modèle custom
    sur un dataset de conteneurs Marsa Maroc

État : EXPÉRIMENTAL
  - Ultralytics installé, modèle yolov8n téléchargé
  - Fonctionne sur images fixes pour détecter des objets génériques
  - Non adapté à la détection de conteneurs (besoin d'entraînement custom)
"""

from typing import List, Optional
from pathlib import Path
from ultralytics import YOLO

_model = None
_model_path = "yolov8n.pt"


def get_model() -> YOLO:
    """Charge le modèle YOLO en lazy-loading."""
    global _model
    if _model is None:
        print(f"[YOLO] Chargement du modèle {_model_path}...")
        _model = YOLO(_model_path)
        print("[YOLO] Modèle prêt.")
    return _model


def detect_objects(image_path: str, confidence_threshold: float = 0.25) -> List[dict]:
    """
    Détecte les objets dans une image avec YOLOv8.

    Le modèle yolov8n (pré-entraîné COCO) reconnaît 80 classes d'objets
    génériques. Il ne reconnaît PAS les conteneurs spécifiquement.

    Args:
        image_path: Chemin vers l'image.
        confidence_threshold: Seuil de confiance minimum (0.0-1.0).

    Returns:
        Liste de dicts: {class_name, confidence, bbox: {x1, y1, x2, y2}}
    """
    model = get_model()
    results = model(image_path, conf=confidence_threshold, verbose=False)

    detections = []
    if results and len(results) > 0:
        result = results[0]
        for box in result.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "class_name": result.names[int(box.cls[0].item())],
                "confidence": round(box.conf[0].item(), 4),
                "bbox": {
                    "x1": round(x1),
                    "y1": round(y1),
                    "x2": round(x2),
                    "y2": round(y2),
                },
            })

    return detections


def crop_detection(image_path: str, bbox: dict, output_path: str) -> str:
    """
    Découpe une zone détectée par YOLO et la sauvegarde.

    Args:
        image_path: Image source.
        bbox: Dict {x1, y1, x2, y2}.
        output_path: Chemin de sauvegarde du crop.

    Returns:
        Chemin du crop sauvegardé.
    """
    from PIL import Image

    img = Image.open(image_path)
    crop = img.crop((bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]))
    crop.save(output_path)
    return output_path


def is_model_available() -> bool:
    """Vérifie si le modèle YOLO est disponible."""
    try:
        get_model()
        return True
    except Exception:
        return False
