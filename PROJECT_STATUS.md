# Statut du projet — Marsa Container Vision

**Date** : 17 avril 2026 (mise à jour : mai 2026)
**Auteur** : Walid Boudarra
**Projet** : Marsa Container Vision — Marsa Maroc

Ce document décrit en toute transparence ce qui a été réalisé, ce qui ne l'a pas été, et ce qu'il reste à faire.

---

## 1. Ce qui a été fait

### Mise à jour — OCR, vision, caméras (mai 2026)
- [x] Prétraitement OpenCV avant OCR (`preprocessing.py`) et pipeline dans `ocr_service.py`
- [x] Validation des codes (`container_code_validator.py`, ISO 6346 avec transparence check digit)
- [x] Score `global_confidence` + seuil `DETECTION_CONFIDENCE_THRESHOLD` + statut `low_confidence` / `invalid_code`
- [x] `demo_cameras.json` v2 (multi-caméras simulées) + `GET /cameras` et `GET /cameras/{id}/latest` (IA)
- [x] `POST /vision/analyze-upload` (IA) ; `POST /api/vision/upload` + jobs async (backend, JWT)
- [x] Préparation RTSP : `rtsp_sources.json`, `rtsp_reader.py` (placeholder)
- [x] `GET /ready` (IA) et `GET /api/ready` (backend)
- [x] Historique : colonnes `source`, `global_confidence`, `evidence_path` + page **Analyse image** (upload)
- [x] Intégration WhatsApp : réponse enrichie avec `global_confidence` (rétrocompatible)

### Infrastructure et configuration
- [x] Architecture complète du projet en microservices (4 services)
- [x] Fichier `docker-compose.yml` fonctionnel pour lancer tout le projet
- [x] Dockerfiles pour chaque service (backend, frontend, ai-service)
- [x] Fichiers `.env.example` pour chaque service
- [x] Script SQL d'initialisation de la base de données
- [x] Fichier `.gitignore`

### Authentification administrateur
- [x] Table `admins` en base de données avec mot de passe hashé (bcrypt)
- [x] Route `POST /api/auth/login` avec vérification bcrypt + génération JWT
- [x] Route `GET /api/auth/me` pour vérifier la session active
- [x] Route `POST /api/auth/logout` pour la déconnexion
- [x] Middleware `authenticateToken` pour protéger toutes les routes sensibles
- [x] Page de login frontend avec gestion des erreurs
- [x] Contexte React (`AuthContext`) pour gérer l'état de connexion
- [x] Protection des routes : redirection vers login si non connecté
- [x] Affichage du nom de l'admin dans le header et dans la carte de résultat
- [x] Bouton de déconnexion dans le header
- [x] Admin de démonstration inséré dans le SQL initial
- [x] Token JWT stocké dans `localStorage` avec interception automatique des requêtes

### Frontend React
- [x] Page de recherche avec champ de saisie et bouton
- [x] Carte de résultat complète après chaque recherche (code, statut, caméra, zone, confiance, date, admin)
- [x] Style différencié : vert si détecté, orange si non détecté
- [x] Animation d'apparition de la carte de résultat
- [x] Grille de détails structurée (2 colonnes, responsive)
- [x] Badge de statut dans la carte de résultat
- [x] Bouton désactivé avec texte "Recherche en cours..." pendant le chargement
- [x] Historique des recherches persistant (chargé depuis la base de données)
- [x] Tableau d'historique avec badges colorés (point + texte), compteur de résultats
- [x] État vide élégant avec icône et message guide
- [x] Badge / encadré "Mode prototype" visible sur le tableau de bord
- [x] Mention "résultat obtenu en mode simulation" sur chaque résultat
- [x] Header avec nom du projet, nom de l'admin, bouton logout
- [x] Design professionnel, responsive, moderne
- [x] Gestion du chargement (loader) et des erreurs
- [x] Validation du code conteneur (ISO 6346 + numérique, trim, uppercase)
- [x] Messages d'erreur de validation clairs avant appel API
- [x] Bouton "Voir preuve" avec modal (fallback si aucune image)
- [x] Bouton "Nouvelle analyse" pour relancer la recherche
- [x] Suggestions affichées si conteneur non trouvé
- [x] Badge de mode dynamique (prototype/réel) récupéré depuis l'API
- [x] Protection contre le double clic pendant la recherche

### Backend Node.js / Express
- [x] Serveur Express avec middleware (CORS, JSON, Morgan)
- [x] Route `POST /api/search-container` (recherche de conteneur, protégée)
- [x] Route `GET /api/detections` (liste des détections, protégée)
- [x] Route `GET /api/detections/:id` (détection par ID, protégée)
- [x] Route `GET /api/search-history` (historique avec info admin, protégée)
- [x] Route `GET /api/health` (vérification de santé, publique)
- [x] Communication HTTP avec le service IA
- [x] Persistance des résultats en base MySQL avec `admin_id`
- [x] Gestion globale des erreurs (middleware)
- [x] Service `containerVisionClient.js` pour intégration WhatsApp (préparé)

### Service IA Python / FastAPI
- [x] Application FastAPI avec documentation automatique (Swagger)
- [x] Route `POST /detect` avec réponse structurée
- [x] Mode simulation (mock) avec 6 conteneurs pré-enregistrés
- [x] Architecture préparée pour le pipeline réel (6 fichiers de services)
- [x] `detector.py` : orchestrateur principal avec switch mock/réel
- [x] `mock_detector.py` : détecteur simulé documenté
- [x] `real_detector.py` : placeholder YOLO avec docstrings et exemples
- [x] `ocr_service.py` : pipeline prétraitement OpenCV + EasyOCR (démo / vision)
- [x] `camera_service.py` : placeholder capture RTSP avec exemples
- [x] `pipeline_service.py` : pipeline complet documenté étape par étape
- [x] Modèles Pydantic étendus (`BoundingBox`, `OCRResult`, `CameraFrame`)
- [x] Tests unitaires (4 tests)
- [x] Route `/health` enrichie (mode, YOLO, OCR, caméras)

### Phase expérimentale — Détection sur image fixe (NOUVEAU)
- [x] **EasyOCR installé et fonctionnel** : lecture de texte dans les images fixes
- [x] **YOLOv8 (ultralytics) installé** : modèle yolov8n pré-entraîné (COCO, 80 classes génériques)
- [x] **PyTorch CPU** installé pour EasyOCR et YOLO
- [x] **Extracteur de codes conteneurs** : regex ISO 6346 + numérique (`code_extractor.py`)
- [x] **Pipeline OCR** : image → EasyOCR → extraction codes → comparaison (`static_pipeline.py`)
- [x] **Pipeline YOLO+OCR** : image → YOLO → crop → OCR → extraction (`static_pipeline.py`)
- [x] **Route `POST /experimental/detect-image`** : upload d'image + analyse OCR ou YOLO+OCR
- [x] **Route `GET /experimental/status`** : état des services expérimentaux
- [x] **Services séparés** : `experimental_ocr.py`, `experimental_yolo.py`, `code_extractor.py`
- [x] **Dossiers de test** : `test_images/`, `test_outputs/`
- [x] **Modèles pré-téléchargés** dans le Dockerfile (EasyOCR anglais, yolov8n)
- [x] **Aucun impact sur le mode mock existant** : routes et services séparés

### Mode DEMO — Détection OCR sur images locales (NOUVEAU)
- [x] **`demo_detector.py`** : détecteur qui analyse les images locales avec EasyOCR
- [x] **`demo_cameras.json`** : mapping entre fichiers image et caméras/zones
- [x] **Dossier `demo_images/`** : images de démonstration (volume Docker monté)
- [x] **Route `GET /demo/images`** : liste les images disponibles
- [x] **Route `GET /demo/status`** : état du mode démo
- [x] **Switch DETECTION_MODE** : support mock / demo / real dans `detector.py`
- [x] **`/health` enrichi** : affiche `demo_available`, `demo_images_count`
- [x] **Images servies en statique** : `FastAPI StaticFiles` sur `/demo_images/`
- [x] **Logs détaillés** : code recherché, images analysées, textes OCR, résultat
- [x] **PrototypeBanner** mis à jour : badge bleu "DEMO" pour le mode démo
- [x] **ResultCard** : affiche l'image de preuve réelle en mode démo
- [x] **docker-compose.yml** : `DETECTION_MODE=demo` par défaut + volume demo_images

### Base de données MySQL
- [x] Table `admins` avec admin de démonstration (mot de passe hashé)
- [x] Table `cameras` avec 5 caméras de démonstration
- [x] Table `detections` avec index sur les colonnes de recherche
- [x] Table `search_history` avec clé étrangère vers `detections` ET vers `admins`
- [x] Script SQL prêt à l'emploi (`database/init.sql`)

### Documentation
- [x] README.md complet et professionnel
- [x] PROJECT_STATUS.md (ce fichier)
- [x] `AI_INTEGRATION_PLAN.md` : plan technique détaillé pour YOLO, OCR, caméras, pipeline
- [x] Codes de test documentés
- [x] Architecture et routes API documentées
- [x] Cas d'usage principal décrit
- [x] Section « Intégration future » dans le README
- [x] Docstrings et TODO complets dans tous les fichiers du service IA

---

## 2. Ce qui n'a PAS été fait

### Détection en production
- [x] ~~Mode principal toujours en mock~~ → **Mode DEMO ajouté : OCR réel sur images locales via DETECTION_MODE=demo**
- [ ] **Modèle YOLO custom non entraîné** : pas de dataset Marsa Maroc, pas de poids custom (.pt)
- [ ] **OCR non validé en conditions réelles** : EasyOCR est installé et fonctionnel mais pas testé sur des images du terminal
- [x] ~~Aucun moteur OCR installé~~ → **EasyOCR est maintenant installé et fonctionnel (expérimental)**
- [x] ~~Aucune image réelle analysée~~ → **Le pipeline expérimental peut analyser des images uploadées**

### Flux caméras
- [ ] **Aucune connexion RTSP** : les URL de flux dans la table `cameras` sont fictives
- [ ] **Aucune capture de frame automatique** : OpenCV est installé mais pas connecté aux caméras
- [ ] **Aucune image de preuve réelle** : les chemins d'images en mode mock sont fictifs

### Fonctionnalités applicatives
- [ ] **Pas de dashboard analytique** : pas de page de statistiques ou de graphiques
- [ ] **Pas de gestion des caméras** : pas d'interface pour ajouter/modifier/supprimer des caméras
- [ ] **Pas d'affichage d'images** : le frontend n'affiche pas d'images de preuve
- [ ] **Pas de temps réel** : pas de WebSocket ni de polling automatique
- [ ] **Pas de notifications** : pas d'alerte quand un conteneur est détecté
- [ ] **Pas de gestion avancée des rôles** : un seul rôle admin
- [ ] **Pas de validation sur données Marsa Maroc** : aucun test avec des données réelles du terminal

---

## 3. Ce qu'il faut faire ensuite

### Priorité haute
1. **Collecter un dataset** de photos de conteneurs Marsa Maroc avec numéros visibles
2. **Entraîner YOLOv8 custom** pour détecter les conteneurs et localiser les zones de numéro
3. **Valider l'OCR** sur des images réelles du terminal (EasyOCR est déjà installé)
4. **Tester le pipeline expérimental** avec des images réelles et mesurer la précision
5. **Connecter le pipeline validé** à la route `/detect` principale (`DETECTION_MODE=real`)

### Priorité moyenne (amélioration)
6. Connecter les caméras RTSP via OpenCV
7. Capturer et stocker les images de preuve réelles
8. Afficher les images de preuve dans le frontend
9. Intégrer le résultat expérimental dans l'interface principale
10. Ajouter la pagination complète pour l'historique
11. Créer un dashboard avec statistiques

### Priorité basse (bonus)
12. Gestion avancée des rôles (opérateur, superviseur, admin)
13. Interface d'administration des caméras
14. Notifications / alertes en temps réel
15. Analyse continue avec WebSocket
16. Export CSV/PDF de l'historique

Voir [`AI_INTEGRATION_PLAN.md`](AI_INTEGRATION_PLAN.md) pour le détail technique de chaque étape.

---

*Ce document est mis à jour au fur et à mesure de l'avancement du projet.*
