#!/usr/bin/env bash
# Vérifie l'API d'intégration + MIME des preuves (/ai/results/ via 5080 ou proxy Marsa).
set -euo pipefail

CV_API="${CV_API:-http://localhost:5081/api}"
CV_WEB="${CV_WEB:-http://localhost:5080}"
MARSA_BASE="${MARSA_BASE:-}"
KEY="${INTEGRATION_API_KEY:-marsa-integration-2026-secret}"
CODE="${CONTAINER_CODE:-MSCU998765}"

echo "== Integration search ($CODE) =="
RESP=$(curl -sf -X POST "$CV_API/integrations/container-search" \
  -H "Content-Type: application/json" \
  -H "x-integration-key: $KEY" \
  -d "{\"container_code\":\"$CODE\",\"source\":\"verify-script\",\"include_proof\":true}")

echo "$RESP" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
const fields=['proof_image_relative_path','whatsapp_image_url','proof_image_web_url','whatsapp_image_sendable'];
for (const f of fields) console.log(f+':', j[f]);
if (!j.found && !j.detected) { console.error('Container not detected — pick CONTAINER_CODE with demo data'); process.exit(2); }
if (!j.proof_image_relative_path) { console.error('Missing proof_image_relative_path'); process.exit(3); }
if (!j.proof_image_relative_path.startsWith('/ai/') && !j.proof_image_relative_path.startsWith('/api/')) {
  console.error('proof path should start with /ai/ or /api/uploads/');
  process.exit(4);
}
"

read -r REL WA <<< "$(echo "$RESP" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
process.stdout.write((j.proof_image_relative_path||'')+' '+(j.whatsapp_image_url||''));
")"

check_url() {
  local label="$1" url="$2"
  echo "== HEAD $label =="
  echo "   $url"
  local ct
  ct=$(curl -sfI -H 'ngrok-skip-browser-warning: true' "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2; exit}')
  echo "   Content-Type: ${ct:-unknown}"
  if [[ -z "$ct" ]]; then echo "FAIL: no content-type"; return 1; fi
  if echo "$ct" | grep -qi 'text/html'; then echo "FAIL: HTML instead of image"; return 1; fi
  if ! echo "$ct" | grep -qi 'image/'; then echo "WARN: not image/* ($ct)"; fi
  echo "OK"
}

check_url "CV web (5080)" "${CV_WEB}${REL}"

if [[ -n "$WA" ]]; then
  if [[ -n "$MARSA_BASE" ]]; then
    check_url "Marsa proxy" "${MARSA_BASE}${REL}"
  else
    check_url "WhatsApp URL from API" "$WA"
  fi
fi

echo "All checks passed."
