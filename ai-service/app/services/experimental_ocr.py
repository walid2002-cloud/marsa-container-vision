"""
Service OCR expérimental utilisant EasyOCR.

Ce module fournit une implémentation RÉELLE de l'OCR sur images fixes
via EasyOCR. Il est séparé du placeholder ocr_service.py pour ne pas
casser le mode mock existant.

État : EXPÉRIMENTAL
  - EasyOCR est installé et fonctionnel
  - La lecture de texte fonctionne sur images fixes
  - La précision dépend fortement de la qualité de l'image
  - Non validé sur des images réelles de conteneurs Marsa Maroc
"""

from typing import List, Tuple
import easyocr
import numpy as np

_reader = None


def get_reader() -> easyocr.Reader:
    """
    Initialise le reader EasyOCR en lazy-loading (une seule fois).
    Utilise le mode CPU uniquement.
    """
    global _reader
    if _reader is None:
        print("[OCR] Initialisation d'EasyOCR (anglais, CPU)...")
        _reader = easyocr.Reader(["en"], gpu=False)
        print("[OCR] EasyOCR prêt.")
    return _reader


def ocr_read_image(image_path: str) -> List[dict]:
    """
    Exécute l'OCR sur une image et retourne tous les textes détectés.

    Args:
        image_path: Chemin vers l'image à analyser.

    Returns:
        Liste de dicts: {text, confidence, bbox}
        bbox = [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] (4 coins)
    """
    reader = get_reader()
    raw_results = reader.readtext(image_path)

    results = []
    for bbox, text, confidence in raw_results:
        results.append({
            "text": text,
            "confidence": float(confidence),
            "bbox": [[int(p[0]), int(p[1])] for p in bbox],
        })

    return results


def ocr_read_numpy(image_array: np.ndarray) -> List[dict]:
    """
    Exécute l'OCR sur un array numpy (image déjà chargée en mémoire).

    Args:
        image_array: Image au format numpy (BGR ou RGB).

    Returns:
        Liste de dicts: {text, confidence, bbox}
    """
    reader = get_reader()
    raw_results = reader.readtext(image_array)

    results = []
    for bbox, text, confidence in raw_results:
        results.append({
            "text": text,
            "confidence": float(confidence),
            "bbox": [[int(p[0]), int(p[1])] for p in bbox],
        })

    return results
