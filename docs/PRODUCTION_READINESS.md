# Marsa Container Vision — Passage DEMO → PRODUCTION

Ce guide décrit les renforts sécurité / caméras RTSP / intégration Marsa Maroc AI.

## Fichiers modifiés (principaux)

### Backend
| Fichier | Rôle |
|---------|------|
| `backend/src/services/passwordPolicyService.js` | Politique mot de passe (9 car., 30 j) |
| `backend/src/services/settingsService.js` | Mode DEMO / PRODUCTION persisté |
| `backend/src/controllers/authController.js` | Expiration MDP, change password, sessions |
| `backend/src/controllers/settingsController.js` | GET/PATCH `/api/settings` |
| `backend/src/controllers/detectionReviewController.js` | Validation manuelle détections |
| `backend/src/controllers/cameraController.js` | Audit CAMERA_*, RTSP_TEST_* |
| `backend/src/controllers/systemController.js` | Santé caméras, badge Marsa AI |
| `backend/src/middleware/securityHeaders.js` | En-têtes HTTP + rate limiting |
| `backend/src/config/ensureSchema.js` | Migrations `password_*`, `system_settings`, `detection_reviews` |
| `backend/src/config/rbac.js` | `settings.manage` pour ADMIN |

### Frontend
| Fichier | Rôle |
|---------|------|
| `frontend/src/components/UserMenu.js` | Avatar, rôle, menu profil |
| `frontend/src/components/Header.js` | Badge mode, lien Marsa Maroc AI |
| `frontend/src/components/CameraAdminPanel.js` | CRUD caméras + test RTSP |
| `frontend/src/components/LiveCamerasPage.js` | Admin + live (demo/production) |
| `frontend/src/components/ProfilePage.js` | Mon profil |
| `frontend/src/components/ChangePasswordPage.js` | Changement MDP |
| `frontend/src/components/SessionsPage.js` | Sessions actives |
| `frontend/src/components/SettingsPage.js` | Mode DEMO/PRODUCTION |
| `frontend/src/components/PrototypeBanner.js` | Bannière mode dynamique |
| `frontend/src/services/api.js` | Nouveaux endpoints |

## Migrations (automatiques au démarrage)

- `admins.password_changed_at`, `admins.password_expires_at`
- `system_settings` (clé/valeur)
- `detection_reviews` (confirm / correct / reject)

## Nouveaux endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/change-password` | Changement forcé (token expiration) |
| POST | `/api/auth/password/change` | Changement authentifié |
| GET | `/api/auth/sessions` | Liste sessions |
| DELETE | `/api/auth/sessions/:id` | Révoquer session |
| GET | `/api/settings` | Paramètres (mode, Marsa AI URL) |
| PATCH | `/api/settings` | Modifier mode / URL (permission `settings.manage`) |
| POST | `/api/detections/review` | Confirmer / corriger / rejeter |

Endpoints caméras existants (inchangés) : `POST /api/cameras`, `PATCH /api/cameras/:id`, `POST /api/cameras/:id/test`, `GET /api/cameras/:id/snapshot`.

## Variables `.env`

```env
# Mode détection IA (demo | real)
DETECTION_MODE=demo

# Lien vers Marsa Maroc AI (header + health check)
MARSA_AI_URL=http://localhost:5173

# Frontend (build Docker)
REACT_APP_MARSA_AI_URL=http://localhost:5173

# Chiffrement mots de passe RTSP (recommandé en production)
CAMERA_CREDENTIALS_KEY=votre_cle_32_octets_minimum

# CORS restrictif
CORS_ORIGINS=http://localhost:5080
```

## Procédure — Ajouter une caméra RTSP

1. Se connecter en **ADMIN** ou **SUPER_ADMIN**
2. Aller sur **Live Cameras**
3. Cliquer **+ Ajouter une caméra**
4. Renseigner :
   - Identifiant : `CAM_05`
   - Nom, zone
   - RTSP URL : `rtsp://192.168.x.x:554/stream1`
   - Username / Password RTSP
   - Intervalle analyse (secondes)
5. Enregistrer — le mot de passe RTSP est **chiffré côté backend**, jamais renvoyé au frontend

## Procédure — Tester une caméra RTSP

1. Dans le tableau **Administration des caméras**, cliquer **Tester RTSP**
2. Le **backend** ouvre le flux via le service IA (`FFmpeg`/`OpenCV`)
3. Réponse attendue :
```json
{
  "success": true,
  "online": true,
  "latencyMs": 85,
  "snapshotUrl": "/api/cameras/CAM_05/snapshot",
  "testedAt": "2026-09-08T12:00:00.000Z"
}
```
4. En cas d'échec : caméra inaccessible, authentification refusée, timeout ou stream invalide — **jamais de simulation de succès**

## Procédure — Passer DEMO → PRODUCTION

1. **Configurer les caméras RTSP** (voir ci-dessus) et tester chaque flux
2. Aller sur `/settings` (permission `settings.manage`)
3. Passer **Mode application** à `PRODUCTION`
4. Dans `.env` / `docker-compose`, définir `DETECTION_MODE=real` pour le service IA
5. Redémarrer : `docker compose up -d --build`
6. Vérifier :
   - Badge **PRODUCTION** dans le header
   - Bannière « Mode production — caméras RTSP connectées »
   - Dashboard : indicateurs caméras online/offline

> Le mode DEMO reste disponible pour la soutenance sans accès aux flux du port.

## Intégration Marsa Maroc AI

- Container Vision expose `POST /api/integrations/container-search` (clé `INTEGRATION_API_KEY`)
- Marsa Maroc AI appelle cette API pour « Où est MSCU998765 ? »
- Réponse structurée : code, zone, caméra, timestamp, confiance, image preuve, liens carte/fiche
- Lien header **Marsa Maroc AI** : variable `MARSA_AI_URL` (non codée en dur)

## Audit — actions ajoutées

`CAMERA_CREATED`, `CAMERA_UPDATED`, `CAMERA_DISABLED`, `RTSP_TEST_SUCCESS`, `RTSP_TEST_FAILED`, `OCR_CORRECTED`, `DETECTION_REJECTED`, `DETECTION_CONFIRMED`, `password.changed`, `settings.updated`

## Tests sécurité effectués

- [x] Politique mot de passe à la création utilisateur et changement
- [x] Expiration 30 jours + blocage login + changement forcé
- [x] Avertissement 7 jours avant expiration (profil + menu)
- [x] Mot de passe RTSP jamais exposé API/UI/logs
- [x] RTSP testé uniquement côté backend
- [x] Rate limiting login (30 req / 15 min) + limite API générale
- [x] En-têtes sécurité (X-Frame-Options, nosniff, Referrer-Policy)
- [x] CORS configurable via `CORS_ORIGINS`
- [x] Requêtes SQL paramétrées (mysql2)
- [x] JWT + refresh token + rotation
- [x] MFA/TOTP maintenu
- [x] RBAC 5 rôles maintenu
- [x] Journal d'audit enrichi

## Lancement

```bash
cd conteneur-marsa
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Application | http://localhost:5080 |
| API | http://localhost:5081/api |
| IA | http://localhost:5082/docs |

Login : `admin@marsamaroc.com` / `admin123`
