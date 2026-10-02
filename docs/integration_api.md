# API d'intégration — Marsa Container Vision

Documentation de l'endpoint d'intégration utilisé par **Marsa Maroc AI** et le **bot WhatsApp**
pour rechercher un conteneur et récupérer une réponse structurée (position, preuve, carte, alertes).

> Phase 7 — Réponse JSON stable, statuts intelligents, URLs publiques propres.

---

## 1. Endpoint

```
POST /api/integrations/container-search
```

- **Méthode** : `POST` (un `GET` renvoie `405 Method Not Allowed`).
- **Authentification** : en-tête `x-integration-key` obligatoire.
- **Content-Type** : `application/json`.

---

## 2. En-têtes

| En-tête | Obligatoire | Description |
|---|---|---|
| `x-integration-key` | Oui | Clé secrète d'intégration (variable `INTEGRATION_API_KEY`). |
| `Content-Type: application/json` | Oui | Corps JSON. |

---

## 3. Corps de la requête

```json
{
  "container_code": "MSCU998765",
  "source": "whatsapp",
  "requester": "+212600000000",
  "include_history": true,
  "include_alerts": true,
  "include_map": true,
  "include_proof": true
}
```

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `container_code` | string | — (requis) | Code du conteneur (ISO 6346 ou code court). |
| `source` | string | `"unknown"` | Origine de l'appel (`whatsapp`, `marsa_ai`, ...). |
| `requester` | string | `null` | Téléphone / identifiant du demandeur (facultatif). |
| `include_history` | bool | `true` | Inclure les derniers déplacements. |
| `include_alerts` | bool | `true` | Inclure les alertes actives. |
| `include_map` | bool | `true` | Inclure `map_url` / `dashboard_url`. |
| `include_proof` | bool | `true` | Inclure la preuve visuelle. |

---

## 4. Réponse

```json
{
  "success": true,
  "found": true,
  "container_code": "MSCU998765",
  "status": "detected",
  "message": "Le conteneur MSCU998765 a été détecté dans la Zone de stockage, caméra CAM_02, avec une confiance de 87 %.",
  "camera": { "id": "CAM_02", "name": "CAM_02", "status": "active" },
  "zone": { "id": "stockage", "name": "Zone de stockage", "label": "Zone B - Stockage" },
  "confidence": 87,
  "last_position": {
    "last_zone": "Zone B - Stockage",
    "last_camera_id": "CAM_02",
    "last_camera_name": "CAM_02",
    "last_detected_at": "2026-07-07T14:00:00.000Z",
    "elapsed_since_last_detection": "détecté il y a 12 minutes",
    "needs_verification": false
  },
  "proof": {
    "available": true,
    "proof_id": "e3b0c442-...",
    "image_url": "https://xxxx.ngrok-free.app/api/proofs/e3b0c442-.../download",
    "thumbnail_url": "https://xxxx.ngrok-free.app/api/proofs/e3b0c442-.../thumbnail",
    "source": "demo_index",
    "captured_at": "2026-07-07T14:00:00.000Z"
  },
  "tracking": { "movements_count": 3, "recent_movements": [ /* ... */ ] },
  "ocr": { "quality": "bon", "matched_code": "MSCU998765", "match_score": 0.92, "partial_code_detected": false },
  "yolo": { "model_mode": "experimental", "container_detected": true, "orientation": "front" },
  "alerts": [ /* alertes actives */ ],
  "map": {
    "zone_id": "stockage",
    "map_url": "https://xxxx.ngrok-free.app/terminal-map?zone=Zone%20B%20-%20Stockage&camera=CAM_02&code=MSCU998765",
    "dashboard_url": "https://xxxx.ngrok-free.app/containers/MSCU998765"
  },
  "dashboard_url": "https://xxxx.ngrok-free.app/containers/MSCU998765",
  "map_url": "https://xxxx.ngrok-free.app/terminal-map?...",
  "audit": { "request_id": "b1d2...", "created_at": "2026-07-07T14:12:00.000Z" }
}
```

### Champs de rétrocompatibilité (toujours présents)

`found`, `container_code`, `camera_id`, `camera_name`, `zone_label`, `map_zone`, `confidence`,
`proof_image_url`, `last_position`, `movements_history`, `alerts`, `whatsapp_message`.

> Note : `camera` et `zone` sont désormais des **objets** (nouveau format). Les chaînes équivalentes
> restent disponibles via `camera_id`, `camera_name`, `zone_label` et `map_zone`.

---

## 5. Statuts intelligents (`status`)

| Statut | Signification | Message type |
|---|---|---|
| `detected` | Détecté dans l'analyse en cours. | « Le conteneur X a été détecté dans la zone ..., caméra ..., avec une confiance de N %. » |
| `known_position` | Non détecté maintenant, mais dernière position connue disponible. | « ... n'a pas été détecté en direct, mais sa dernière position connue est ... détecté il y a 2 heures. » |
| `uncertain` | OCR faible / code partiel / résultat douteux. | « Une correspondance possible a été trouvée ..., mais l'OCR est incertain. Vérification humaine recommandée. » |
| `not_found` | Aucune information connue. | « Aucune position connue n'a été trouvée pour le conteneur X. » |

En présence d'alertes actives, le `message` est complété (position ancienne, OCR incertain,
mauvaise zone, immobilisation prolongée).

---

## 6. Message WhatsApp à construire

Côté Marsa Maroc AI, un message simple peut être assemblé ainsi :

```
📦 Conteneur {container_code}
{message}
📍 Position : {zone.name} · {camera.name}
🕒 {last_position.elapsed_since_last_detection}
🗺️ Carte : {map_url}
🔗 Fiche : {dashboard_url}
```

Joindre l'image `proof.image_url` si `proof.available === true`.

---

## 7. Gestion de l'image preuve

- `proof.image_url` : lien direct téléchargeable (`/api/proofs/:id/download` ou preuve IA).
- `proof_image_relative_path` : chemin proxy stable, ex. `/ai/results/evidence_xxx.png` (servi par nginx `:5080` → service IA).
- `whatsapp_image_url` : URL absolue pour Marsa / WhatsApp — base **`INTEGRATION_PUBLIC_BASE_URL`** (tunnel ngrok Marsa → `:3000`, **pas** le port 5080).
- `proof_image_web_url` : URL pour ouvrir la preuve dans le navigateur Container Vision (`PUBLIC_APP_URL` / `5080`).
- `proof.thumbnail_url` : miniature.
- Toujours une **URL publique** (jamais de chemin local `/app/uploads/...`).
- Si l'image n'existe plus : `410 Gone` avec message clair, `proof.available = false`.

Architecture recommandée (un seul ngrok) :

1. `ngrok http 3000` → backend **Marsa Maroc AI**
2. Marsa Maroc AI : `PUBLIC_APP_URL=https://xxxx.ngrok-free.dev`
3. Container Vision backend : `INTEGRATION_PUBLIC_BASE_URL=https://xxxx.ngrok-free.dev` (même URL)
4. Marsa proxifie `GET /ai/results/*` vers `CONTAINER_VISION_WEB_URL` (ex. `http://host.docker.internal:5080`)

---

## 8. Gestion de `map_url` et `dashboard_url`

- `map_url` : carte terminal préremplie `?zone=...&camera=...&code=...`.
- `dashboard_url` : page détail conteneur `/containers/:code`.
- Générés via le helper `publicUrl.js` (voir variables ci-dessous).

---

## 9. Alertes

`alerts[]` contient les alertes actives du conteneur :

```json
{ "type": "OLD_POSITION", "severity": "warning", "message": "...", "status": "active", "created_at": "..." }
```

Types possibles : `OLD_POSITION`, `OCR_SUSPICIOUS`, `WRONG_ZONE`, `IMMOBILIZED_TOO_LONG`,
`WATCHED_CONTAINER_DETECTED`, `CAMERA_INACTIVE`, `AI_SERVICE_ERROR`.

---

## 10. Variables d'environnement

| Variable | Rôle |
|---|---|
| `INTEGRATION_API_KEY` | Clé attendue dans `x-integration-key`. |
| `PUBLIC_APP_URL` | URL publique UI Container Vision (`5080`, carte, fiche). |
| `NGROK_URL` | Tunnel optionnel sur CV — prioritaire pour `getPublicBase()` (UI). |
| `INTEGRATION_PUBLIC_BASE_URL` | Base des preuves WhatsApp / Marsa (`/ai/...` via proxy Marsa `:3000`). |
| `MARSA_PUBLIC_PROXY_URL` | Alias de `INTEGRATION_PUBLIC_BASE_URL`. |

Ordre **UI** : `NGROK_URL` > `PUBLIC_APP_URL` > `http://localhost:5080`.

Ordre **preuves intégration** : `INTEGRATION_PUBLIC_BASE_URL` > `MARSA_PUBLIC_PROXY_URL` > `NGROK_URL` > `PUBLIC_APP_URL`.

Vérification : `node scripts/verify-public-url.js` et `scripts/verify-integration-proof.sh` (stack démarrée).

---

## 11. Sécurité (`x-integration-key`)

- Clé manquante ou invalide → `401` : `{ "success": false, "error": "Clé d'intégration manquante ou invalide." }`.
- Chaque tentative invalide est **auditée** (clé masquée, jamais stockée en clair).
- Chaque appel valide est audité avec `request_id`, `source`, `requester`.

---

## 12. Codes d'erreur

| HTTP | Cas | Message |
|---|---|---|
| 400 | `container_code` manquant | « Le champ container_code est requis. » |
| 401 | Clé absente/invalide | « Clé d'intégration manquante ou invalide. » |
| 500 | Erreur interne | « Erreur interne pendant l'analyse. Veuillez réessayer ou contacter l'administrateur. » |

Toutes les réponses d'erreur incluent un `request_id` pour la traçabilité. Aucune stack trace
n'est renvoyée au client.

---

## 13. Exemple `curl`

```bash
curl -X POST https://VOTRE_DOMAINE/api/integrations/container-search \
  -H "Content-Type: application/json" \
  -H "x-integration-key: VOTRE_CLE" \
  -d '{ "container_code": "MSCU998765", "source": "whatsapp", "include_proof": true }'
```
