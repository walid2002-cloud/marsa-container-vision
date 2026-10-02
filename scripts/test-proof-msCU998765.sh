#!/usr/bin/env bash
set -euo pipefail
CODE="${CONTAINER_CODE:-MSCU998765}"
CV_API="${CV_API:-http://localhost:5081/api}"
CV_WEB="${CV_WEB:-http://localhost:5080}"
KEY="${INTEGRATION_API_KEY:-marsa-integration-2026-secret}"

echo "=== Integration POST $CODE ==="
RESP=$(curl -sf -X POST "$CV_API/integrations/container-search" \
  -H "Content-Type: application/json" \
  -H "x-integration-key: $KEY" \
  -d "{\"container_code\":\"$CODE\",\"source\":\"test-script\",\"include_proof\":true}")

node -e "
const j=JSON.parse(process.argv[1]);
console.log('proofAvailable:', j.proofAvailable ?? j.proof_available);
console.log('proofImageUrl:', j.proofImageUrl || j.proof_image_url);
console.log('proofMimeType:', j.proofMimeType || j.proof_mime_type);
console.log('whatsapp_image_sendable:', j.whatsapp_image_sendable);
if (!(j.proofAvailable || j.proof_available)) process.exit(2);
if (!j.proofImageUrl && !j.proof_image_url) process.exit(2);
" "$RESP"

URL=$(node -pe "JSON.parse(process.argv[1]).proofImageUrl||JSON.parse(process.argv[1]).proof_image_url" "$RESP")
REL=$(node -pe "JSON.parse(process.argv[1]).proof_image_relative_path||''" "$RESP")
FN=$(basename "${REL:-$URL}")

echo
echo "URL finale: $URL"
echo "Chemin relatif: ${REL:-n/a}"
echo "Fichier: $FN"

print_headers() {
  local label="$1"
  local target="$2"
  echo
  echo "=== $label ==="
  echo "GET $target"
  local tmp
  tmp=$(mktemp)
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' -D "$tmp" -H 'ngrok-skip-browser-warning: true' "$target" || true)
  echo "HTTP status: $code"
  awk 'BEGIN{IGNORECASE=1} /^HTTP\// {print} /^Content-Type:/ {print} /^Content-Length:/ {print}' "$tmp" | tr -d '\r'
  rm -f "$tmp"
  if [[ "$code" != "200" ]]; then
    echo "ECHEC: status $code"
    return 1
  fi
}

print_headers "GET preuve publique (Marsa ngrok / INTEGRATION_PUBLIC_BASE_URL)" "$URL" || true

if [[ -n "$FN" && "$FN" != "/" ]]; then
  print_headers "GET CV backend /api/media/results" "$CV_API/media/results/$FN"
  print_headers "GET nginx /ai/results (local 5080)" "$CV_WEB/ai/results/$FN"
fi

echo
echo "=== OK : preuve prête pour Marsa Maroc AI ==="
