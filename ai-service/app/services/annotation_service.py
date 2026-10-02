"""
Génération d’images « preuve » annotées (cadres, scores, métadonnées).

Les fichiers sont écrits sous RESULTS_DIR (ex. /app/results) et servis
statiquement par FastAPI sur le préfixe /results/.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

RESULTS_DIR = os.getenv("RESULTS_DIR", "/app/results")


def _ensure_dir() -> None:
    os.makedirs(RESULTS_DIR, exist_ok=True)


def _draw_label(img: np.ndarray, text: str, org: tuple, color: tuple) -> None:
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.55
    th = 1
    (tw, th_text), _ = cv2.getTextSize(text, font, scale, th)
    x, y = org
    pad = 4
    cv2.rectangle(
        img,
        (x, y - th_text - 2 * pad),
        (x + tw + 2 * pad, y + pad),
        (0, 0, 0),
        -1,
    )
    cv2.putText(img, text, (x + pad, y - pad), font, scale, color, th, cv2.LINE_AA)


def build_evidence_image(
    bgr: np.ndarray,
    *,
    camera_name: str,
    zone: str,
    yolo_bbox: Optional[Dict[str, int]] = None,
    ocr_bbox: Optional[Dict[str, int]] = None,
    detected_text: Optional[str] = None,
    ocr_confidence: float = 0.0,
    yolo_confidence: float = 0.0,
    global_confidence: float = 0.0,
    yolo_detected: bool = False,
) -> str:
    """
    Dessine les rectangles et légendes, sauvegarde un PNG unique.

    Returns:
        Chemin relatif URL (ex. /results/evidence_xxx.png)
    """
    _ensure_dir()
    out = bgr.copy()
    h, w = out.shape[:2]

    if yolo_bbox:
        cv2.rectangle(
            out,
            (yolo_bbox["x1"], yolo_bbox["y1"]),
            (yolo_bbox["x2"], yolo_bbox["y2"]),
            (40, 200, 40),
            3,
        )
        _draw_label(
            out,
            "Zone conteneur (YOLO)",
            (yolo_bbox["x1"], max(24, yolo_bbox["y1"] - 8)),
            (180, 255, 180),
        )
    else:
        # Plein cadre = zone OCR sans ROI YOLO
        cv2.rectangle(out, (4, 4), (w - 5, h - 5), (180, 180, 40), 2)
        _draw_label(out, "Analyse OCR plein cadre", (8, 28), (0, 255, 255))

    if ocr_bbox and ocr_bbox != yolo_bbox:
        cv2.rectangle(
            out,
            (ocr_bbox["x1"], ocr_bbox["y1"]),
            (ocr_bbox["x2"], ocr_bbox["y2"]),
            (40, 140, 255),
            2,
        )
        _draw_label(
            out,
            "Zone OCR",
            (ocr_bbox["x1"], min(h - 8, ocr_bbox["y2"] + 22)),
            (200, 220, 255),
        )

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines: List[str] = [
        f"Camera: {camera_name}",
        f"Zone: {zone}",
        f"Timestamp: {ts}",
        f"YOLO: {'oui' if yolo_detected else 'non'} ({yolo_confidence:.0%})",
        f"OCR: {ocr_confidence:.0%}",
        f"Global: {global_confidence:.0%}",
    ]
    if detected_text:
        lines.append(f"Texte: {detected_text[:80]}")

    y0 = 28
    for i, line in enumerate(lines):
        y = y0 + i * 22
        cv2.putText(
            out,
            line,
            (12, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            out,
            line,
            (12, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (20, 20, 20),
            1,
            cv2.LINE_AA,
        )

    fname = f"evidence_{int(time.time() * 1000)}.png"
    fpath = os.path.join(RESULTS_DIR, fname)
    cv2.imwrite(fpath, out)
    return f"/results/{fname}"


def build_demo_index_text_fallback_image(
    *,
    display_code: str,
    camera_name: str,
    zone: str,
    expected_demo_filename: str,
) -> str:
    """
    PNG minimal (fond sombre + texte) si demo_images manque ou est illisible.
    Ne doit être utilisé qu’en dernier recours (voir demo_index_service).
    """
    _ensure_dir()
    h, w = 360, 220
    img = np.zeros((h, w, 3), dtype=np.uint8)
    y = 36
    for line in (
        "DEMO INDEX — image manquante",
        f"Code: {display_code}",
        f"Fichier attendu: {expected_demo_filename}",
        f"Camera: {camera_name}",
        f"Zone: {zone}",
    ):
        cv2.putText(
            img,
            line[:72],
            (12, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (240, 240, 240),
            1,
            cv2.LINE_AA,
        )
        y += 26
    fname = f"demo_index_text_fallback_{int(time.time() * 1000)}.png"
    fpath = os.path.join(RESULTS_DIR, fname)
    cv2.imwrite(fpath, img)
    return f"/results/{fname}"


def annotated_url_from_path(saved_relative: str) -> str:
    """Normalise en URL relative."""
    if not saved_relative:
        return ""
    if saved_relative.startswith("/"):
        return saved_relative
    return f"/{saved_relative.lstrip('./')}"
