"""
Configuration globale du service IA.

Ce fichier centralise toutes les variables de configuration du service.
Le mode de détection (mock / real) est contrôlé par la variable d'environnement
DETECTION_MODE. En mode "mock", les résultats sont simulés à partir d'une liste
fixe. En mode "real", le pipeline YOLO + OCR sera utilisé (à implémenter).
"""

import os

# ── Mode de détection ──────────────────────────────────────────────
# "mock"  → simulation : compare le code à une liste prédéfinie
# "demo"  → démo OCR : analyse des images locales dans demo_images/
# "real"  → production : utilise le pipeline YOLO + OCR sur RTSP (non implémenté)
DETECTION_MODE = os.getenv("DETECTION_MODE", "demo")

# ── Répertoire des images de preuve ────────────────────────────────
# En mode réel, les frames capturées et les crops seront stockés ici.
EVIDENCE_DIR = os.getenv("EVIDENCE_DIR", "./evidence")

# ── Configuration YOLO (futur) ─────────────────────────────────────
# TODO : Décommenter et adapter quand le modèle sera entraîné.
# YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "./models/yolov8_containers.pt")
# YOLO_CONFIDENCE_THRESHOLD = float(os.getenv("YOLO_CONFIDENCE_THRESHOLD", "0.5"))

# ── Configuration OCR (futur) ──────────────────────────────────────
# TODO : Choisir le moteur OCR et configurer ici.
# OCR_ENGINE = os.getenv("OCR_ENGINE", "easyocr")  # easyocr | tesseract | paddleocr
# OCR_LANGUAGES = ["en"]

# ── Liste des caméras connues ──────────────────────────────────────
# En production, cette liste proviendra de la base de données.
CAMERAS = [
    {"camera_name": "CAM_01", "zone": "Zone A - Quai Nord"},
    {"camera_name": "CAM_02", "zone": "Zone B - Quai Sud"},
    {"camera_name": "CAM_03", "zone": "Zone C - Aire de stockage"},
    {"camera_name": "CAM_04", "zone": "Zone D - Entrée terminale"},
]

# ── Conteneurs pré-enregistrés (mode simulation uniquement) ───────
# En production, cette liste est remplacée par la détection YOLO + OCR.
MOCK_CONTAINERS = {
    # Code ISO couramment utilisé pour tests WhatsApp / intégration
    "MSCU7894563": {"camera_name": "CAM_02", "zone": "Zone B - Stockage", "confidence": 0.92},
    "79943": {"camera_name": "CAM_01", "zone": "Zone A - Quai Nord", "confidence": 0.93},
    "55210": {"camera_name": "CAM_02", "zone": "Zone B - Quai Sud", "confidence": 0.87},
    "31887": {"camera_name": "CAM_03", "zone": "Zone C - Aire de stockage", "confidence": 0.91},
    "44562": {"camera_name": "CAM_01", "zone": "Zone A - Quai Nord", "confidence": 0.78},
    "60239": {"camera_name": "CAM_04", "zone": "Zone D - Entrée terminale", "confidence": 0.95},
    "12750": {"camera_name": "CAM_02", "zone": "Zone B - Quai Sud", "confidence": 0.82},
}
