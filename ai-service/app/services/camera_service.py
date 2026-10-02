"""
Service de capture d'images depuis les caméras de surveillance.

Ce module est un placeholder préparé pour la connexion aux caméras RTSP
du terminal portuaire. Il sera utilisé pour capturer des frames qui seront
ensuite analysées par le pipeline YOLO + OCR.

Intégration prévue :
  1. Installer OpenCV : pip install opencv-python-headless
  2. Configurer les URL RTSP des caméras dans la base de données
  3. Implémenter capture_frame() et capture_all_cameras()
  4. Appeler depuis pipeline_service.py

Contraintes à prévoir :
  - Latence réseau des flux RTSP
  - Qualité variable des images (lumière, angle, météo)
  - Gestion des caméras en panne ou hors ligne
  - Stockage des frames (espace disque)
  - Fréquence de capture (toutes les N secondes)
"""

from typing import List, Optional
from app.config import CAMERAS, EVIDENCE_DIR
from app.models.schemas import CameraFrame

# TODO : Décommenter quand OpenCV est installé.
# import cv2


def capture_frame(camera_url: str, output_path: str) -> Optional[str]:
    """
    Capture une frame depuis un flux RTSP.

    TODO : Implémenter quand les caméras sont accessibles.

    Pipeline prévu :
      1. Ouvrir le flux vidéo avec cv2.VideoCapture(camera_url)
      2. Lire une frame avec cap.read()
      3. Sauvegarder la frame en JPEG dans output_path
      4. Fermer le flux
      5. Retourner le chemin de l'image sauvegardée

    Exemple :
        cap = cv2.VideoCapture(camera_url)
        ret, frame = cap.read()
        cap.release()
        if ret:
            cv2.imwrite(output_path, frame)
            return output_path
        return None

    Args:
        camera_url: URL RTSP de la caméra (ex: rtsp://192.168.1.101:554/stream)
        output_path: Chemin de sauvegarde de la frame capturée.

    Returns:
        Chemin de l'image sauvegardée, ou None si la capture a échoué.
    """
    raise NotImplementedError(
        "La capture de frames RTSP n'est pas encore implémentée. "
        "Les caméras du terminal ne sont pas encore connectées."
    )


def capture_all_cameras() -> List[CameraFrame]:
    """
    Capture une frame depuis chaque caméra active.

    TODO : Implémenter quand les caméras sont configurées.

    Pipeline prévu :
      1. Récupérer la liste des caméras actives (depuis config ou DB)
      2. Pour chaque caméra, appeler capture_frame()
      3. Construire un CameraFrame pour chaque capture réussie
      4. Retourner la liste des frames

    Args:
        Aucun (utilise la configuration globale CAMERAS).

    Returns:
        Liste de CameraFrame capturées.
    """
    raise NotImplementedError(
        "La capture multi-caméras n'est pas encore implémentée."
    )


def test_camera_connection(camera_url: str) -> bool:
    """
    Vérifie si une caméra RTSP est accessible.

    TODO : Implémenter pour le monitoring des caméras.

    Exemple :
        cap = cv2.VideoCapture(camera_url)
        is_open = cap.isOpened()
        cap.release()
        return is_open

    Args:
        camera_url: URL RTSP à tester.

    Returns:
        True si la caméra est accessible, False sinon.
    """
    raise NotImplementedError(
        "Le test de connexion caméra n'est pas encore implémenté."
    )
