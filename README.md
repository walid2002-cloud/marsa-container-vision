# Marsa Container Vision

**Système de vérification de présence de conteneurs pour Marsa Maroc**

> Walid Boudarra — 2026

---

## Présentation

Marsa Container Vision est une application web qui permet de vérifier la présence d'un conteneur dans le terminal portuaire de Marsa Maroc. L'administrateur autorisé se connecte, saisit l'identifiant d'un conteneur, et le système interroge un service d'intelligence artificielle pour déterminer si le conteneur est détecté par les caméras de surveillance.

Chaque recherche est enregistrée dans la base de données avec le résultat, la caméra, la zone, le score de confiance et l'administrateur qui a effectué la recherche. Un historique persistant est consultable à tout moment.

> **Transparence** : la détection actuelle fonctionne en **mode simulation (mock)**. Aucun modèle YOLO, aucun OCR et aucun flux caméra réel ne sont connectés. Le service IA compare le code saisi à une liste prédéfinie de conteneurs. L'architecture est prête pour intégrer les composants réels.

---

## Architecture

Le projet suit une architecture microservices avec 4 composants principaux :

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Frontend   │───▶│   Backend    │───▶│  Service IA  │    │    MySQL     │
│ React / Nginx│    │ Express.js   │    │   FastAPI     │    │   8.0        │
│   Port 5080  │    │  Port 5081   │    │  Port 5082   │    │  Port 5306   │
└──────────────┘    └──────┬───────┘    └──────────────┘    └──────────────┘
                           │                                       ▲
                           └───────────────────────────────────────┘
                                     Persistance MySQL
```

| Service | Technologie | Port | Rôle |
|---------|-------------|------|------|
| Frontend | React 18 + Nginx | 5080 | Interface utilisateur (login, recherche, historique) |
| Backend | Node.js + Express | 5081 | API REST, authentification JWT, persistance |
| Service IA | Python + FastAPI | 5082 | Détection de conteneurs (mock / réel) |
| Base de données | MySQL 8.0 | 5306 | Stockage persistant |

---

## Fonctionnalités réalisées

### Authentification administrateur
- Login par email / mot de passe avec JWT
- Protection de toutes les routes sensibles par token
- Page de connexion dédiée avec redirection automatique
- Session persistante (token stocké côté client)
- Déconnexion propre

### Recherche de conteneurs
- Formulaire de recherche par identifiant de conteneur
- Appel au service IA via le backend
- Affichage détaillé du résultat (caméra, zone, confiance, date/heure)
- Gestion des erreurs et du chargement

### Historique des recherches
- Enregistrement de chaque recherche en base de données
- Liaison entre la recherche et l'administrateur qui l'a effectuée
- Tableau d'historique persistant avec colonnes : code, résultat, caméra, zone, confiance, admin, date
- Rechargement automatique de l'historique après chaque nouvelle recherche

### Service IA
- API FastAPI avec mode simulation (mock) et architecture prête pour le mode réel
- 6 conteneurs pré-enregistrés pour les tests en mode simulation
- **Phase expérimentale sur image fixe** :
  - EasyOCR installé et fonctionnel pour lire du texte dans les images
  - YOLOv8 installé avec modèle pré-entraîné (COCO, détection générique)
  - Extracteur de codes conteneurs (regex ISO 6346 + numérique)
  - Pipeline `image → OCR → extraction` fonctionnel
  - Pipeline `image → YOLO + OCR → extraction` expérimental
  - Route dédiée `POST /experimental/detect-image`

### Interface
- Badge "Mode prototype" visible sur le tableau de bord
- Header avec nom du projet, nom de l'admin connecté, bouton déconnexion
- Design professionnel et responsive
- États vides, chargement et erreurs gérés proprement

---

## Base de données

### Tables

| Table | Rôle | Colonnes principales |
|-------|------|---------------------|
| `admins` | Administrateurs autorisés | id, full_name, email, password_hash, role, created_at |
| `cameras` | Caméras de surveillance | id, camera_name, zone, stream_url, status |
| `detections` | Résultats de détection | id, container_code, detected, camera_name, zone, confidence, image_path, detected_at |
| `search_history` | Historique des recherches | id, searched_code, result, detection_id (FK), admin_id (FK), searched_at |

### Relations

- `search_history.detection_id` → `detections.id` (ON DELETE SET NULL)
- `search_history.admin_id` → `admins.id` (ON DELETE SET NULL)

### Données de démonstration

- **1 administrateur** : Walid Boudarra (admin@marsamaroc.com)
- **5 caméras** : CAM_01 à CAM_05 dans différentes zones

---

## Routes API

### Authentification (publiques)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/login` | Connexion administrateur (email + mot de passe) |

### Authentification (protégées)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/auth/me` | Informations de l'admin connecté |
| POST | `/api/auth/logout` | Déconnexion (invalidation côté client) |

### Recherche et détection (protégées)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/search-container` | Rechercher un conteneur par code |
| GET | `/api/detections` | Liste des dernières détections (50 max) |
| GET | `/api/detections/:id` | Détail d'une détection par ID |
| GET | `/api/search-history` | Historique des recherches (50 max, paramètre `?limit=N`) |

### Expérimental — Détection sur image fixe (service IA)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/experimental/detect-image` | Analyse OCR (ou YOLO+OCR) sur une image uploadée |
| GET | `/experimental/status` | État des services expérimentaux (OCR, YOLO) |

> **Note** : ces routes sont exposées directement par le service IA (port 8001), pas par le backend Express.

### Système (publique)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | État du backend et de la base de données |

---

## Cas d'usage principal

1. **L'admin se connecte** : il accède à la page de login et saisit ses identifiants (email + mot de passe)
2. **Il saisit un identifiant de conteneur** : dans le formulaire de recherche du tableau de bord
3. **L'application appelle le backend** : le frontend envoie une requête `POST /api/search-container` avec le token JWT
4. **Le backend interroge le service IA** : via `POST http://ai-service:8001/detect`
5. **Le résultat est enregistré en base** : dans les tables `detections` et `search_history` (lié à l'admin)
6. **L'interface affiche le résultat** : carte détaillée avec caméra, zone, confiance, date/heure
7. **L'historique se met à jour** : le tableau d'historique persistant se recharge automatiquement

---

## Installation et lancement

### Prérequis

- **Docker** et **Docker Compose** installés
- Ports **5080**, **5081**, **5082**, **5306** (et **6379** si Redis exposé) disponibles

### Lancement

```bash
# Cloner le projet
git clone <url-du-repo>
cd conteneur-marsa

# Lancer tous les services
docker compose up --build
```

### Accès

| Service | URL |
|---------|-----|
| Application (frontend) | http://localhost:5080 |
| API backend | http://localhost:5081/api |
| Service IA (Swagger) | http://localhost:5082/docs |

### Identifiants de démonstration

| Champ | Valeur |
|-------|--------|
| Email | `admin@marsamaroc.com` |
| Mot de passe | `admin123` |

### Codes de conteneurs pour tester (mode simulation)

| Code | Résultat attendu |
|------|-------------------|
| 79943 | Détecté (CAM_01, Zone A - Quai Nord, 93%) |
| 55210 | Détecté (CAM_02, Zone B - Quai Sud, 87%) |
| 31887 | Détecté (CAM_03, Zone C - Aire de stockage, 91%) |
| 44562 | Détecté (CAM_01, Zone A - Quai Nord, 78%) |
| 60239 | Détecté (CAM_04, Zone D - Entrée terminale, 95%) |
| 12750 | Détecté (CAM_02, Zone B - Quai Sud, 82%) |
| 00000 | Non détecté |

### Tester la détection expérimentale sur image fixe

Le service IA expose une route expérimentale qui effectue une vraie lecture OCR sur une image uploadée.

```bash
# Test OCR simple (retourne tous les textes lus dans l'image)
curl -X POST http://localhost:5082/experimental/detect-image \
  -F "file=@mon_image.jpg"

# Test OCR avec recherche d'un code spécifique
curl -X POST http://localhost:5082/experimental/detect-image \
  -F "file=@mon_image.jpg" \
  -F "container_code=MSCU1234567"

# Test pipeline YOLO + OCR
curl -X POST http://localhost:5082/experimental/detect-image \
  -F "file=@mon_image.jpg" \
  -F "mode=yolo_ocr"

# Vérifier l'état des services expérimentaux
curl http://localhost:5082/experimental/status
```

---

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| MYSQL_ROOT_PASSWORD | marsa_root_2026 | Mot de passe root MySQL |
| MYSQL_DATABASE | marsa_container_db | Nom de la base de données |
| MYSQL_USER | marsa_user | Utilisateur MySQL |
| MYSQL_PASSWORD | marsa_pass_2026 | Mot de passe MySQL |
| DETECTION_MODE | demo | Mode de détection (mock / demo / real) |
| DEMO_IMAGES_DIR | /app/demo_images | Dossier des images de démonstration |
| DEMO_CAMERAS_FILE | /app/demo_cameras.json | Mapping image → caméra/zone |
| JWT_SECRET | marsa_jwt_secret_2026 | Clé secrète pour les tokens JWT |
| INTEGRATION_API_KEY | marsa-integration-2026-secret | Clé d'accès pour les intégrations externes (WhatsApp, etc.) |

---

## Structure du projet

```
conteneur-marsa/
├── docker-compose.yml
├── .env
├── .env.example
├── README.md
├── PROJECT_STATUS.md
├── AI_INTEGRATION_PLAN.md
│
├── database/
│   └── init.sql                     # Script d'initialisation (tables + données)
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── server.js                # Point d'entrée Express
│       ├── config/
│       │   └── database.js          # Pool de connexions MySQL
│       ├── controllers/
│       │   ├── authController.js    # Login, getMe, logout
│       │   ├── searchController.js  # Recherche de conteneur
│       │   └── detectionController.js # Détections et historique
│       ├── middleware/
│       │   ├── auth.js              # Vérification JWT
│       │   └── errorHandler.js      # Gestion globale des erreurs
│       └── routes/
│           ├── auth.js              # Routes authentification
│           ├── search.js            # Route recherche
│           ├── detections.js        # Routes détections/historique
│           └── health.js            # Route santé
│
├── ai-service/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── test_images/                 # Images de test (gitignored)
│   ├── test_outputs/                # Résultats YOLO crops (gitignored)
│   └── app/
│       ├── main.py                  # Application FastAPI
│       ├── config.py                # Configuration
│       ├── models/
│       │   └── schemas.py           # Modèles Pydantic (mock + expérimental)
│       ├── routers/
│       │   ├── detection.py         # Router détection (mock, existant)
│       │   └── experimental.py      # Router expérimental (image fixe)
│       └── services/
│           ├── detector.py          # Orchestrateur mock/réel
│           ├── mock_detector.py     # Détecteur simulé
│           ├── real_detector.py     # Détecteur YOLO (placeholder futur)
│           ├── ocr_service.py       # Service OCR (placeholder futur)
│           ├── camera_service.py    # Capture RTSP (placeholder futur)
│           ├── pipeline_service.py  # Pipeline complet (placeholder futur)
│           ├── experimental_ocr.py  # OCR réel EasyOCR (EXPÉRIMENTAL)
│           ├── experimental_yolo.py # YOLO yolov8n (EXPÉRIMENTAL)
│           ├── code_extractor.py    # Extraction codes conteneurs (regex)
│           └── static_pipeline.py   # Pipeline image fixe (EXPÉRIMENTAL)
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── public/
    │   └── index.html
    └── src/
        ├── index.js
        ├── App.js                   # Routing + Dashboard
        ├── App.css
        ├── contexts/
        │   └── AuthContext.js        # Gestion de l'authentification
        ├── services/
        │   └── api.js               # Client HTTP avec token
        └── components/
            ├── LoginPage.js / .css   # Page de connexion
            ├── Header.js / .css      # En-tête avec admin + logout
            ├── SearchBar.js / .css   # Barre de recherche
            ├── ResultCard.js / .css  # Carte de résultat
            ├── HistoryTable.js / .css # Tableau d'historique
            └── PrototypeBanner.js / .css # Badge mode prototype
```

---

## Phase expérimentale : détection sur image fixe

Le projet dispose maintenant d'une **partie expérimentale fonctionnelle** qui permet de tester la détection IA sur des images fixes (uploadées manuellement), sans impacter le mode mock existant.

### Ce qui fonctionne réellement

| Composant | État | Détails |
|-----------|------|---------|
| **EasyOCR** | Fonctionnel | Lecture de texte dans les images fixes |
| **Extracteur de codes** | Fonctionnel | Regex ISO 6346 + numérique |
| **Pipeline OCR** | Fonctionnel | image → OCR → extraction → comparaison |
| **YOLOv8** | Installé (limité) | Modèle yolov8n générique (COCO, 80 classes) |
| **Pipeline YOLO+OCR** | Expérimental | Fonctionne mais YOLO ne cible pas les conteneurs |

### Ce qui reste expérimental / non validé

- Le modèle YOLO (yolov8n) est **générique** — il ne détecte PAS spécifiquement les conteneurs maritimes
- L'OCR n'a **pas été validé** sur des images réelles du terminal Marsa Maroc
- La **précision** dépend fortement de la qualité de l'image (résolution, angle, éclairage)
- Aucune **caméra RTSP** n'est connectée — l'analyse se fait sur des images uploadées uniquement

### Architecture expérimentale

```
Image uploadée ──→ EasyOCR ──→ Extraction regex ──→ Comparaison ──→ Résultat
                      │
              (optionnel, mode yolo_ocr)
                      │
Image uploadée ──→ YOLOv8 ──→ Crop zones ──→ OCR sur crops ──→ Extraction ──→ Résultat
```

---

## Intégration future de la détection réelle

Le projet est architecturé pour permettre l'intégration progressive d'une détection réelle en production. Un plan technique complet est disponible dans [`AI_INTEGRATION_PLAN.md`](AI_INTEGRATION_PLAN.md).

### Prochaines étapes

1. **Entraîner un modèle YOLO custom** sur un dataset de conteneurs Marsa Maroc
2. **Valider l'OCR** sur des images réelles du terminal
3. **Connecter les caméras RTSP** pour l'analyse en temps réel
4. **Remplacer le mode mock** par le pipeline réel via `DETECTION_MODE=real`

---

## Mode démo — Détection sans accès aux caméras

Les caméras RTSP de Marsa Maroc sont confidentielles et ne sont pas accessibles pour le développement. Le mode **demo** permet de tester le pipeline OCR réel sur des **images locales** placées dans un dossier.

### Comment ça marche

Quand `DETECTION_MODE=demo` :
1. L'admin tape un code conteneur dans l'interface
2. Le service IA scanne toutes les images du dossier `demo_images/`
3. EasyOCR lit le texte visible sur chaque image
4. Les codes conteneurs sont extraits par regex (ISO 6346 + numérique)
5. Si le code recherché est trouvé dans une image → **Détecté** avec la caméra/zone correspondante
6. Sinon → **Non détecté**

### Ajouter une image de démonstration

1. Placez un fichier `.jpg` ou `.png` dans `ai-service/demo_images/`
   - Utilisez une photo de conteneur avec un numéro visible
   - Nommez le fichier de manière descriptive (ex: `cam01_quai_nord.jpg`)

2. Ajoutez l'entrée dans `ai-service/demo_cameras.json` :
```json
{
  "cam01_quai_nord.jpg": {
    "camera_name": "CAM_01",
    "zone": "Zone A - Quai Nord"
  }
}
```

3. Relancez : `docker compose up --build`

### Changer de mode

Dans `docker-compose.yml`, modifiez `DETECTION_MODE` :

| Mode | Comportement |
|------|-------------|
| `mock` | Simulation avec liste fixe de 6 conteneurs |
| `demo` | Analyse OCR réelle sur images locales |
| `real` | Pipeline YOLO + OCR + RTSP (futur) |

### Tester le mode démo

```bash
# Voir les images disponibles
curl http://localhost:5082/demo/images

# Vérifier le statut
curl http://localhost:5082/health

# Rechercher un conteneur (via le backend)
TOKEN=$(curl -s http://localhost:5081/api/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@marsamaroc.com","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

curl -s http://localhost:5081/api/search-container -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"container_code":"MSCU1234567"}'
```

### Routes démo (service IA)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/demo/images` | Liste des images de démo avec infos caméra |
| GET | `/demo/status` | État du mode démo |

---

### Limites actuelles (transparence)

| Aspect | État |
|--------|------|
| **Mode principal** | Simulation (mock) — compare le code à une liste fixe |
| **Modèle YOLO custom** | Non entraîné — pas de dataset Marsa Maroc |
| **OCR en production** | Non validé sur images réelles |
| **Flux caméras** | Non connectés — URLs RTSP fictives |
| **Images de preuve** | Chemins fictifs en mode mock |
| **Détection expérimentale** | Fonctionnelle sur images fixes uploadées |

---

## Améliorations UX (dernière mise à jour)

### Interface de recherche
- Validation du code conteneur avant envoi (format ISO 6346 + numérique)
- Normalisation automatique (trim, majuscules, suppression des séparateurs)
- Messages d'erreur de validation clairs
- État de chargement amélioré : bouton désactivé + "Analyse en cours..." + spinner
- Protection contre le double clic

### Carte de résultat
- Badge vert "Détecté" / orange "Absent" selon le résultat
- Suggestions affichées si le conteneur n'est pas trouvé
- Bouton "Voir preuve" (avec fallback si aucune image disponible)
- Bouton "Nouvelle analyse" pour relancer la recherche sur le même code

### Badge de mode dynamique
- Le badge "Mode prototype" / "Mode réel" est désormais dynamique
- Le mode est récupéré depuis l'API `/health` du service IA
- Affiche la disponibilité de la phase expérimentale

---

## API d'intégration externe (WhatsApp Bot, etc.)

Une route API dédiée permet à des services externes (bot WhatsApp, scripts, autres backends) d'interroger le système de détection sans avoir besoin d'un token JWT admin.

### Endpoint

```
POST /api/integrations/container-search
```

### Authentification

L'appel requiert un header `x-integration-key` contenant la clé définie dans la variable d'environnement `INTEGRATION_API_KEY`.

### Body (JSON)

```json
{
  "container_code": "MSCU1234567",
  "source": "whatsapp-bot"
}
```

### Réponse — conteneur détecté

```json
{
  "code": "MSCU7894563",
  "detected": true,
  "camera": "CAM_02",
  "zone": "Zone B - Quai Sud",
  "confidence": 72,
  "global_confidence": 75,
  "timestamp": "2026-05-06T14:30:00",
  "mode": "demo",
  "evidence_image_url": "/demo_images/cam02_mscu789456.png",
  "message": "Le conteneur MSCU7894563 est détecté en Zone B - Quai Sud via CAM_02 avec une confiance de 72%."
}
```

### Réponse — conteneur non détecté

```json
{
  "code": "ABCD1234567",
  "detected": false,
  "camera": null,
  "zone": null,
  "confidence": null,
  "global_confidence": null,
  "timestamp": "2026-05-06T14:30:00",
  "mode": "demo",
  "evidence_image_url": null,
  "message": "Le conteneur ABCD1234567 n'a pas été trouvé dans les caméras disponibles."
}
```

### Exemple curl

```bash
curl -X POST http://localhost:5081/api/integrations/container-search \
  -H "Content-Type: application/json" \
  -H "x-integration-key: marsa-integration-2026-secret" \
  -d '{"container_code": "MSCU7894563", "source": "whatsapp-bot"}'
```

### Variable d'environnement

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| `INTEGRATION_API_KEY` | `marsa-integration-2026-secret` | Clé d'accès pour les intégrations externes |
| `DETECTION_CONFIDENCE_THRESHOLD` | `0.35` | Seuil global (0–1) en mode démo : en dessous, réponse `low_confidence` / non détecté |
| `CORS_ORIGINS` | _(vide = tout)_ | Liste d'origines autorisées pour le backend (virgules) |

### Vision, caméras et santé (aperçu)

| Composant | Endpoint | Description |
|-----------|----------|-------------|
| Service IA | `GET http://localhost:5082/ready` | OpenCV, EasyOCR, dossier `demo_images`, mode détection |
| Service IA | `GET http://localhost:5082/cameras` | Liste des caméras simulées (zones, statut, dernière analyse) |
| Service IA | `GET http://localhost:5082/cameras/CAM_01/latest` | Image de démo + métadonnées pour une caméra |
| Service IA | `POST http://localhost:5082/vision/analyze-upload` | Multipart `file` + option `match_code` — OCR + extraction de codes |
| Backend (JWT) | `POST /api/vision/upload` | Proxy vers l'IA + enregistrement historique (`source=upload`) |
| Backend (JWT) | `POST /api/vision/jobs` + `GET /api/vision/jobs/:id` | File d'attente asynchrone simple (statuts pending / processing / done / failed) |
| Backend | `GET /api/ready` | MySQL joignable |

Prétraitement OCR (OpenCV) : niveaux de gris, redimensionnement, débruitage, CLAHE, binarisation adaptative — voir `ai-service/app/services/preprocessing.py`.

### Utilisation depuis le bot WhatsApp

Dans votre projet WhatsApp, appelez cette API :

```javascript
const axios = require('axios');

const MARSA_API = process.env.MARSA_API_URL || 'http://localhost:5081';
const API_KEY = process.env.MARSA_INTEGRATION_KEY || 'marsa-integration-2026-secret';

async function rechercherConteneur(code) {
  const { data } = await axios.post(
    `${MARSA_API}/api/integrations/container-search`,
    { container_code: code, source: 'whatsapp-bot' },
    { headers: { 'x-integration-key': API_KEY }, timeout: 120000 }
  );
  return data;
}
```

### Exemple de conversation WhatsApp

```
Utilisateur : MSCU7894563

Bot :
Conteneur MSCU7894563
Detecte
Zone : Zone B - Quai Sud
Camera : CAM_02
Confiance : 72%

---

Utilisateur : ABC999

Bot :
Conteneur ABC999
Non detecte
Le conteneur n'a pas ete trouve dans les cameras disponibles.
```

---

## Service client interne : `containerVisionClient.js`

Le fichier `backend/src/services/containerVisionClient.js` fournit un client réutilisable :
- `searchContainer(code)` — appelle le service IA et retourne un résultat normalisé
- `formatAsTextMessage(result)` — formate le résultat en message texte lisible

Ce service est utilisé en interne par la route d'intégration.

---

---

## Extension soutenance PFE — pipeline industriel

### Vue d’ensemble

| Composant | Description |
|-----------|-------------|
| **YOLO → OCR** | `YOLO_ENABLED=true` : ROI YOLOv8 (COCO, heuristique véhicules / plus grande boîte) puis OCR sur le crop ; sinon pipeline OCR plein cadre (inchangé). |
| **Preuves annotées** | PNG sous `/results/` + champs `evidence_image_url`, `annotated_image_url` dans la réponse FastAPI. |
| **RTSP** | `rtsp_reader.py` : capture OpenCV, timeout, threads 1 fps si `RTSP_MONITOR_ENABLED=true` + URL valide dans `rtsp_sources.json`. |
| **Celery + Redis** | Tâches async : `POST /jobs/detect` + `GET /jobs/detect/{task_id}` (statuts `pending` / `processing` / `done` / `failed`). Activer `CELERY_ENABLED=true` et lancer le service `celery-worker`. |
| **Dashboard** | Page `/analytics` : KPI, graphiques CSS, historique, images récentes, flux Socket.IO. |
| **Live Cameras** | Page `/live-cameras` : CAM_01–04, image RTSP cache ou fallback image démo via proxy `/ai/`. |
| **Notifications** | Table `notifications` + création auto sur détection / faible confiance / intégration. |
| **WebSocket** | Socket.IO côté backend (`detection_update`) + client sur le dashboard. |
| **Monitoring** | `JSON_LOGS=true` pour logs JSON ; profil Docker `monitoring` : Loki + Grafana (`docker compose --profile monitoring up -d`). |
| **Health** | `/ready` : EasyOCR, YOLO (si activé), Redis, workers Celery (si activé), disque, répertoire `results`, statut RTSP. |

### Variables d’environnement (nouvelles / utiles)

| Variable | Défaut | Rôle |
|----------|--------|------|
| `YOLO_ENABLED` | `false` | Active l’inférence YOLO avant OCR (plus lent, plus « industriel »). |
| `REDIS_URL` | `redis://redis:6379/0` (compose) | Broker Celery + backend résultats. |
| `CELERY_ENABLED` | `false` | Active les routes `/jobs/*` sur le service IA. |
| `RESULTS_DIR` | `/app/results` | Images annotées. |
| `RTSP_MONITOR_ENABLED` | `false` | Threads de lecture RTSP en arrière-plan. |
| `JSON_LOGS` | `false` | Logs structurés JSON (Loki / agrégation). |

### curl — file d’attente Celery (service IA)

```bash
# Activer CELERY_ENABLED=true sur ai-service + démarrer celery-worker
curl -s -X POST http://localhost:5082/jobs/detect \
  -H "Content-Type: application/json" \
  -d '{"container_code":"MSCU7894563"}'

# Remplacer TASK_ID par la valeur retournée
curl -s http://localhost:5082/jobs/detect/TASK_ID
```

### curl — intégration (champs YOLO / preuves)

La route `POST /api/integrations/container-search` inclut désormais notamment : `yolo_detected`, `yolo_confidence` (%), `ocr_confidence` (%), `annotated_image_url`, `evidence_image_url`.

### Grafana + Loki (optionnel)

```bash
docker compose --profile monitoring up -d
# Grafana : http://localhost:3000  (admin / valeur de GRAFANA_ADMIN_PASSWORD)
# Loki    : http://localhost:3100
```

### Fichiers principaux touchés par cette extension

- **IA** : `app/services/yolo_service.py`, `annotation_service.py`, `demo_detector.py`, `rtsp_reader.py`, `app/celery_worker.py`, `app/tasks_workers.py`, `app/routers/jobs.py`, `app/models/schemas.py`, `app/main.py`, `app/routers/cameras.py`, `requirements.txt`, `Dockerfile`, `rtsp_sources.json`
- **Docker** : `docker-compose.yml` (redis, celery-worker, volumes `ai_results`, variables)
- **Backend** : `src/server.js`, `src/config/ensureSchema.js`, `controllers/searchController.js`, `integrationController.js`, `cameraController.js`, `analyticsController.js`, `notificationController.js`, `services/notificationService.js`, `services/containerVisionClient.js`, `routes/analytics.js`, `routes/notifications.js`, `routes/cameras.js`, `package.json`
- **Frontend** : `src/App.js`, `src/setupProxy.js`, `components/SearchHomePage.js`, `AnalyticsPage.js`, `LiveCamerasPage.js`, `Header.js`, `ResultCard.js`, `services/api.js`, `nginx.conf`, `package.json`
- **Base** : `database/init.sql`

---

*Marsa Container Vision — Walid Boudarra — 2026*
