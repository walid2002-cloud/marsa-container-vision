# Plan d'intégration de la détection réelle — Marsa Container Vision

**Date** : 17 avril 2026
**Auteur** : Walid Boudarra
**Projet** : Marsa Container Vision — Marsa Maroc

Ce document décrit le plan technique pour passer du mode simulation actuel à une détection réelle de conteneurs par intelligence artificielle. Il est destiné à servir de référence pour l'équipe de développement et les encadrants.

> **État actuel** : la détection principale est simulée (mode mock). Une **phase expérimentale** est maintenant disponible pour tester l'OCR (EasyOCR) et YOLO (yolov8n) sur des images fixes uploadées via `POST /experimental/detect-image`. Ce document explique comment progresser vers la détection réelle en production.

---

## A. Intégration de YOLO

### Rôle

YOLOv8 (You Only Look Once) sera utilisé pour :

- **Détecter les conteneurs** présents dans une image capturée par les caméras
- **Localiser la zone** contenant l'identifiant imprimé sur le conteneur
- **Produire des bounding boxes** avec les coordonnées exactes de chaque conteneur détecté
- **Fournir un score de confiance** pour chaque détection

### Type de modèle

- **YOLOv8** (Ultralytics) — architecture de détection d'objets en temps réel
- Variantes recommandées :
  - `yolov8n` (nano) : rapide, pour les tests initiaux
  - `yolov8s` (small) : bon compromis vitesse/précision
  - `yolov8m` (medium) : pour la production si les ressources le permettent

### Dataset nécessaire

Pour entraîner le modèle, il faut constituer un dataset :

1. **Collecter des images** de conteneurs dans le terminal portuaire Marsa Maroc
   - Différentes conditions de lumière (jour, nuit, couvert)
   - Différents angles de vue
   - Différentes distances
   - Conteneurs partiellement visibles

2. **Annoter les images** avec un outil comme LabelImg, Roboflow ou CVAT
   - Classe : `container` (le conteneur entier)
   - Classe : `container_id` (la zone du numéro uniquement)

3. **Volume recommandé** : minimum 500-1000 images annotées pour un premier modèle fonctionnel

4. **Format** : YOLO format (fichiers .txt avec classe + coordonnées normalisées)

### Où brancher dans le code

| Fichier | Rôle |
|---------|------|
| `ai-service/app/services/real_detector.py` | Charger le modèle, exécuter la détection, retourner les bounding boxes |
| `ai-service/app/config.py` | Configurer le chemin du modèle et le seuil de confiance |
| `ai-service/app/main.py` | Charger le modèle au démarrage de l'application |

### Entrées / Sorties

| | Description |
|---|---|
| **Entrée** | Image JPEG/PNG (frame de caméra, 1920x1080 ou similaire) |
| **Sortie** | Liste de `BoundingBox` : coordonnées (x1, y1, x2, y2), confiance, classe |

### Commandes d'installation

```bash
pip install ultralytics
```

### Exemple de code d'entraînement

```python
from ultralytics import YOLO

model = YOLO('yolov8s.pt')  # Modèle pré-entraîné

results = model.train(
    data='dataset/data.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    name='marsa_containers'
)
```

---

## B. Intégration de l'OCR

### Rôle

L'OCR (Optical Character Recognition) sera utilisé pour :

- **Lire le texte** visible sur la zone du numéro du conteneur
- **Convertir l'image du texte** en chaîne de caractères exploitable
- **Retourner un identifiant** qui sera comparé à la recherche de l'utilisateur

### Outils possibles

| Outil | Avantages | Inconvénients |
|-------|-----------|---------------|
| **EasyOCR** | Simple à utiliser, supporte GPU, bonne précision | Plus lent que PaddleOCR |
| **PaddleOCR** | Très performant, bon sur texte industriel | Installation plus complexe |
| **Tesseract** | Classique, léger, open source | Nécessite beaucoup de prétraitement |

**Recommandation** : commencer avec **EasyOCR** pour sa simplicité, puis évaluer PaddleOCR si la précision est insuffisante.

### Où brancher dans le code

| Fichier | Rôle |
|---------|------|
| `ai-service/app/services/ocr_service.py` | Initialiser l'OCR, lire le texte, normaliser le résultat |
| `ai-service/app/config.py` | Configurer le moteur OCR et les langues |
| `ai-service/app/main.py` | Initialiser le moteur au démarrage |

### Sortie attendue

```python
OCRResult(
    text="MSCU 123456 7",        # Texte brut détecté
    normalized_text="MSCU1234567", # Texte nettoyé
    confidence=0.87               # Score de confiance
)
```

### Commandes d'installation

```bash
# EasyOCR
pip install easyocr

# PaddleOCR (alternative)
pip install paddlepaddle paddleocr

# Tesseract (alternative)
pip install pytesseract
# + installer tesseract-ocr sur le système
```

---

## C. Intégration des caméras

### Lecture RTSP

Les caméras du terminal portuaire sont généralement accessibles via des flux RTSP (Real Time Streaming Protocol). Le service IA se connectera à ces flux pour capturer des frames.

### Extraction de frames

```
Caméra RTSP → OpenCV (cv2.VideoCapture) → Frame JPEG → Analyse YOLO + OCR
```

L'extraction peut se faire de deux manières :

1. **Snapshot à la demande** : quand un admin lance une recherche, capturer une frame de chaque caméra
2. **Capture périodique** : un worker capture les frames toutes les N secondes et les analyse en continu

Le mode **snapshot à la demande** est recommandé pour commencer (plus simple).

### Analyse périodique (futur)

En production, un système d'analyse continue pourrait :

- Capturer une frame de chaque caméra toutes les 30 secondes
- Analyser chaque frame avec YOLO + OCR
- Stocker tous les conteneurs détectés dans la base de données
- Permettre une recherche instantanée dans les résultats récents

### Contraintes à anticiper

| Contrainte | Description | Mitigation |
|-----------|-------------|------------|
| **Qualité d'image** | Images floues, mal éclairées, à contre-jour | Prétraitement (CLAHE, binarisation) |
| **Angle de vue** | Numéros non perpendiculaires à la caméra | Dataset varié pour l'entraînement |
| **Lumière** | Variations jour/nuit, ombres, reflets | Augmentation de données lors de l'entraînement |
| **Occlusion** | Conteneurs partiellement cachés | Détection avec confiance réduite |
| **Réseau** | Latence ou indisponibilité du flux RTSP | Timeout + retry + fallback |
| **Volume** | Beaucoup de frames à analyser | Traitement asynchrone, GPU si disponible |

### Où brancher dans le code

| Fichier | Rôle |
|---------|------|
| `ai-service/app/services/camera_service.py` | Connexion RTSP, capture de frames, test de connectivité |
| `ai-service/app/config.py` | URL des caméras (ou récupération depuis la base MySQL) |
| `ai-service/requirements.txt` | Ajouter `opencv-python-headless` |

### Commandes d'installation

```bash
pip install opencv-python-headless
```

---

## D. Pipeline complet de détection (mode réel)

Voici le pipeline cible, étape par étape :

```
┌─────────────────────────────────────────────────────────────────┐
│                    PIPELINE DE DÉTECTION                        │
│                                                                 │
│  1. Recherche lancée par l'admin (code conteneur)               │
│     │                                                           │
│  2. Capture des frames depuis les caméras RTSP                  │
│     │  camera_service.capture_all_cameras()                     │
│     │                                                           │
│  3. Détection YOLO sur chaque frame                             │
│     │  real_detector.detect_objects(frame)                      │
│     │  → liste de bounding boxes                                │
│     │                                                           │
│  4. Crop de la zone du numéro pour chaque conteneur détecté     │
│     │  real_detector.crop_region(frame, box)                    │
│     │                                                           │
│  5. Prétraitement du crop si nécessaire                         │
│     │  pipeline_service.preprocess_image(crop)                  │
│     │  → niveaux de gris, binarisation, contraste               │
│     │                                                           │
│  6. Lecture OCR du numéro                                       │
│     │  ocr_service.extract_text_from_image(crop)                │
│     │  → texte brut + confiance                                 │
│     │                                                           │
│  7. Normalisation du texte détecté                              │
│     │  ocr_service.normalize_container_code(text)               │
│     │  → "MSCU 123456 7" → "MSCU1234567"                       │
│     │                                                           │
│  8. Comparaison avec le code recherché                          │
│     │  Si match → DetectionResponse(detected=True, ...)         │
│     │  Si non   → passer au conteneur / caméra suivant          │
│     │                                                           │
│  9. Aucune correspondance → DetectionResponse(detected=False)   │
└─────────────────────────────────────────────────────────────────┘
```

### Fichier orchestrateur

`ai-service/app/services/pipeline_service.py` contient la fonction `run_detection_pipeline()` qui implémentera ce pipeline. Un pseudo-code complet est déjà documenté dans ce fichier.

### Activation

Pour passer en mode réel :

1. Implémenter les services (`camera_service`, `real_detector`, `ocr_service`)
2. Modifier `detector.py` pour appeler `pipeline_service.run_detection_pipeline()`
3. Changer `DETECTION_MODE=real` dans le fichier `.env`
4. Relancer les conteneurs Docker

---

## E. Roadmap technique

### Phase 1 — Préparation du dataset (1-2 semaines)

- [ ] Collecter 500+ images de conteneurs depuis le terminal Marsa Maroc
- [ ] Annoter les images (classe `container` et `container_id`)
- [ ] Constituer les splits train/val/test (70/20/10)
- [ ] Créer le fichier `data.yaml` pour YOLO

### Phase 2 — Entraînement YOLO (1 semaine)

- [ ] Installer ultralytics sur une machine avec GPU
- [ ] Entraîner YOLOv8s sur le dataset
- [ ] Évaluer les métriques (mAP, précision, rappel)
- [ ] Exporter le modèle en `.pt`
- [ ] Placer le modèle dans `ai-service/models/`

### Phase 3 — Validation OCR (1 semaine)

- [x] ~~Installer EasyOCR~~ → **Fait** (expérimental)
- [x] ~~Implémenter la lecture OCR~~ → **Fait** (`experimental_ocr.py`)
- [x] ~~Implémenter la normalisation~~ → **Fait** (`code_extractor.py`)
- [ ] Tester sur des crops de numéros de conteneurs réels Marsa Maroc
- [ ] Mesurer la précision sur 50+ images réelles
- [ ] Ajuster le prétraitement si nécessaire (CLAHE, binarisation)
- [ ] Comparer avec PaddleOCR si EasyOCR est insuffisant

### Phase 4 — Connexion caméras (1 semaine)

- [x] ~~Installer OpenCV~~ → **Fait** (opencv-python-headless dans le Docker)
- [ ] Obtenir les URL RTSP des caméras du terminal
- [ ] Implémenter `capture_frame()` dans `camera_service.py`
- [ ] Tester la capture depuis chaque caméra
- [ ] Gérer les cas d'erreur (caméra offline, timeout)

### Phase 5 — Assemblage du pipeline (1 semaine)

- [ ] Implémenter `run_detection_pipeline()` dans `pipeline_service.py`
- [ ] Connecter camera → YOLO → crop → OCR → comparaison
- [ ] Tester le pipeline complet de bout en bout
- [ ] Passer `DETECTION_MODE=real`
- [ ] Valider avec des recherches réelles

### Phase 6 — Optimisation (continu)

- [ ] Améliorer la précision YOLO avec plus de données
- [ ] Tester différents moteurs OCR
- [ ] Optimiser les temps de réponse
- [ ] Ajouter le stockage des images de preuve réelles
- [ ] Afficher les images dans le frontend

---

## Ce qui est fait actuellement

### Application complète
- Application web fonctionnelle (React + Express + FastAPI + MySQL + Docker)
- Authentification admin avec JWT
- Historique des recherches persistant en base de données
- Service IA en mode simulation (mock) avec 6 conteneurs de test

### Phase expérimentale (image fixe)
- **EasyOCR installé et fonctionnel** : lecture de texte dans les images fixes
- **YOLOv8 installé** (ultralytics) : modèle yolov8n pré-entraîné (COCO, 80 classes)
- **OpenCV installé** (opencv-python-headless) pour le traitement d'images
- **PyTorch CPU** installé pour EasyOCR et YOLO
- **Extracteur de codes conteneurs** par regex (ISO 6346 + numérique)
- **Pipeline OCR fonctionnel** : image → EasyOCR → extraction codes → comparaison
- **Pipeline YOLO+OCR expérimental** : image → YOLO → crop → OCR → extraction
- **Route dédiée** : `POST /experimental/detect-image` (upload d'image)
- **Route statut** : `GET /experimental/status` (état des services)
- Modèles pré-téléchargés dans le Docker (EasyOCR anglais, yolov8n)
- Aucun impact sur le mode mock existant

## Ce qui n'est PAS fait

- **Modèle YOLO custom** non entraîné : pas de dataset Marsa Maroc
- **OCR non validé** en conditions réelles du terminal
- **Aucune caméra RTSP** connectée
- **Mode principal toujours mock** : la route `/detect` utilise la simulation
- **Précision non mesurée** : pas de benchmark sur images réelles
- Le modèle yolov8n est **générique** (COCO) et ne détecte pas les conteneurs spécifiquement

---

*Ce document sera mis à jour au fur et à mesure de l'intégration des composants réels.*
