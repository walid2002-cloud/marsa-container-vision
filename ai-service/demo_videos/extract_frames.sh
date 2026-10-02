#!/usr/bin/env bash
# Extrait des frames d'une vidéo vers demo_images/ pour simulation caméra.
# Usage : ./extract_frames.sh <video.mp4> <CAM_ID> [every_n_frames]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/../demo_images"
VIDEO="${1:-}"
CAM="${2:-CAM_01}"
EVERY="${3:-30}"

if [[ -z "$VIDEO" ]]; then
  echo "Usage: $0 <video.mp4> <CAM_ID> [every_n_frames]"
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg est requis. Installez-le (brew install ffmpeg)."
  exit 1
fi

CAM_LOWER=$(echo "$CAM" | tr '[:upper:]' '[:lower:]' | tr '_' '')
PREFIX="${CAM_LOWER}_frame"
mkdir -p "$OUT_DIR"

echo "Extraction vers ${OUT_DIR}/${PREFIX}_%04d.png (1 frame / ${EVERY})..."
ffmpeg -y -i "$VIDEO" -vf "select=not(mod(n\,${EVERY}))" -vsync vfr \
  "${OUT_DIR}/${PREFIX}_%04d.png"

FIRST=$(ls "${OUT_DIR}/${PREFIX}"_*.png 2>/dev/null | head -1)
if [[ -n "$FIRST" ]]; then
  BASENAME=$(basename "$FIRST")
  echo ""
  echo "Terminé. Mettez à jour demo_cameras.json pour ${CAM} :"
  echo "  \"demo_image\": \"${BASENAME}\""
fi
