"""
Détecteur YOLO pour la localisation de conteneurs dans les images.

Ce module est un placeholder préparé pour l'intégration de YOLOv8.
Il sera utilisé quand DETECTION_MODE=real et qu'un modèle entraîné
sera disponible.

Rôle :
  - Charger le modèle YOLO (fichier .pt)
  - Recevoir une image (frame de caméra)
  - Détecter les conteneurs présents dans l'image
  - Retourner les bounding boxes avec scores de confiance

Intégration prévue :
  1. Installer ultralytics : pip install ultralytics
  2. Placer le modèle entraîné dans ./models/yolov8_containers.pt
  3. Implémenter load_model() et detect_objects()
  4. Appeler depuis pipeline_service.py

Entrées attendues :
  - image_path (str) : chemin vers l'image ou frame capturée
  - Ou frame numpy array directement depuis OpenCV

Sorties attendues :
  - Liste de BoundingBox (voir models/schemas.py)
  - Chaque box contient : x1, y1, x2, y2, confidence, class_name
"""

from typing import List
from app.models.schemas import BoundingBox


# TODO : Décommenter quand ultralytics est installé et le modèle disponible.
# from ultralytics import YOLO
# from app.config import YOLO_MODEL_PATH, YOLO_CONFIDENCE_THRESHOLD

_model = None


def load_model() -> None:
    """
    Charge le modèle YOLOv8 en mémoire.

    TODO : Implémenter quand le modèle est entraîné.

    Exemple :
        global _model
        _model = YOLO(YOLO_MODEL_PATH)
        print(f"[YOLO] Modèle chargé depuis {YOLO_MODEL_PATH}")
    """
    raise NotImplementedError(
        "Le modèle YOLO n'est pas encore disponible. "
        "Entraînez un modèle YOLOv8 et placez-le dans ./models/"
    )


def detect_objects(image_path: str) -> List[BoundingBox]:
    """
    Exécute la détection YOLO sur une image.

    TODO : Implémenter quand le modèle est chargé.

    Pipeline prévu :
      1. Charger l'image avec PIL ou OpenCV
      2. Passer l'image dans le modèle YOLO
      3. Filtrer les détections par seuil de confiance
      4. Convertir les résultats en liste de BoundingBox
      5. Retourner les boxes

    Exemple :
        results = _model(image_path, conf=YOLO_CONFIDENCE_THRESHOLD)
        boxes = []
        for r in results[0].boxes:
            boxes.append(BoundingBox(
                x1=r.xyxy[0][0].item(),
                y1=r.xyxy[0][1].item(),
                x2=r.xyxy[0][2].item(),
                y2=r.xyxy[0][3].item(),
                confidence=r.conf[0].item(),
                class_name=results[0].names[int(r.cls[0].item())]
            ))
        return boxes

    Args:
        image_path: Chemin vers l'image à analyser.

    Returns:
        Liste de BoundingBox détectées.
    """
    raise NotImplementedError(
        "La détection YOLO n'est pas encore implémentée."
    )


def crop_region(image_path: str, box: BoundingBox, output_path: str) -> str:
    """
    Découpe une région d'intérêt dans l'image à partir d'une bounding box.

    TODO : Implémenter pour extraire la zone contenant le numéro du conteneur.

    Exemple :
        from PIL import Image
        img = Image.open(image_path)
        crop = img.crop((box.x1, box.y1, box.x2, box.y2))
        crop.save(output_path)
        return output_path

    Args:
        image_path: Chemin de l'image source.
        box: Coordonnées de la zone à découper.
        output_path: Chemin de sauvegarde du crop.

    Returns:
        Chemin du crop sauvegardé.
    """
    raise NotImplementedError(
        "Le crop de région n'est pas encore implémenté."
    )
