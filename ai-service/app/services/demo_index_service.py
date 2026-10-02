"""
Index démo fiable (demo_containers.json) — prioritaire sur l'OCR en mode demo.

Recherche : code canonique exact, alias exact, fuzzy léger uniquement sur les alias
avec garde-fous préfixe ISO (MSCU… ne matche jamais CSNU…).
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2

from app.services.annotation_service import (
    build_demo_index_text_fallback_image,
    build_evidence_image,
)
from app.services.camera_registry import touch_last_analysis
from app.services.fuzzy_match_service import classify_search_code, levenshtein
from app.services.ocr_normalizer import strip_special_and_upper

log = logging.getLogger("marsa.demo_index")

_BUNDLED_CONTAINERS = "/app/bundled/demo_containers.json"
_DEFAULT_CONTAINERS = "/app/demo_containers.json"


def _containers_path_candidates() -> List[str]:
    """Chemins essayés dans l'ordre (bind mount vide, image embarquée, dépôt local)."""
    c: List[str] = []
    env = os.getenv("DEMO_CONTAINERS_FILE")
    if env:
        c.append(env)
    c.append(_BUNDLED_CONTAINERS)
    c.append(_DEFAULT_CONTAINERS)
    c.append(str(Path(__file__).resolve().parent.parent.parent / "demo_containers.json"))
    seen: set = set()
    out: List[str] = []
    for p in c:
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return out


def _resolve_containers_path() -> Optional[str]:
    for p in _containers_path_candidates():
        if os.path.isfile(p):
            return p
    return None


_ISO_PREFIX = re.compile(r"^[A-Z]{4}")
_NUM_ONLY = re.compile(r"^\d+$")

_cache: Optional[List[Dict[str, Any]]] = None


def _load_entries() -> List[Dict[str, Any]]:
    global _cache
    if _cache is not None:
        return _cache
    path = _resolve_containers_path()
    if not path:
        log.warning(
            "[DEMO_INDEX] aucun fichier index (essayé : %s)",
            ", ".join(_containers_path_candidates()),
        )
        _cache = []
        return _cache
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            _cache = []
            return _cache
        _cache = data
        log.info("[DEMO_INDEX] %s entrées chargées depuis %s", len(_cache), path)
        return _cache
    except Exception as e:
        log.warning("[DEMO_INDEX] lecture impossible (%s) : %s", path, e)
        _cache = []
        return _cache


def _images_dir() -> str:
    return os.getenv("DEMO_IMAGES_DIR", "/app/demo_images")


def reload_demo_index() -> None:
    """Tests / rechargement à chaud."""
    global _cache
    _cache = None
    _load_entries()


def validate_demo_containers_at_startup() -> None:
    """
    Au démarrage : vérifie que chaque entrée pointe vers un fichier présent sous demo_images.
    """
    entries = _load_entries()
    if not entries:
        log.warning("[DEMO_INDEX][startup] index vide ou fichier introuvable")
        return
    base = _images_dir()
    seen_images: Dict[str, List[str]] = {}
    for e in entries:
        code = _norm(str(e.get("code", "")))
        img = str(e.get("image") or "").strip()
        if not img or "/" in img or ".." in img:
            log.warning("[DEMO_INDEX][startup] nom d'image invalide pour code=%r : %r", code, img)
            continue
        full = os.path.join(base, img)
        if not os.path.isfile(full):
            log.warning(
                "[DEMO_INDEX][startup] image manquante code=%r fichier=%r chemin=%s",
                code,
                img,
                full,
            )
        else:
            seen_images.setdefault(img, []).append(code)
    for img, codes in seen_images.items():
        if len(codes) > 1:
            log.info(
                "[DEMO_INDEX][startup] même image %r pour plusieurs codes : %s",
                img,
                ", ".join(codes),
            )


def _norm(s: str) -> str:
    return strip_special_and_upper(s or "")


def _conf_to_float(c: Any) -> float:
    try:
        v = float(c)
    except (TypeError, ValueError):
        return 0.95
    if v > 1.0:
        return min(0.99, v / 100.0)
    return min(0.99, max(0.0, v))


def _iso_prefix(s: str) -> Optional[str]:
    m = _ISO_PREFIX.match(s)
    return m.group(0) if m else None


def _alias_fuzzy_numeric(req: str, alias: str) -> Tuple[bool, float]:
    if not _NUM_ONLY.match(req) or not _NUM_ONLY.match(alias):
        return False, 0.0
    if abs(len(req) - len(alias)) > 1:
        return False, 0.0
    d = levenshtein(req, alias)
    if d > 1:
        return False, 0.0
    sim = SequenceMatcher(None, req, alias).ratio()
    return True, sim


def _alias_fuzzy_iso(req: str, alias: str, canon: str) -> Tuple[bool, float]:
    pr = _iso_prefix(req)
    pa = _iso_prefix(alias)
    pc = _iso_prefix(canon)
    if not pr or not pc:
        return False, 0.0
    if pr != pc:
        return False, 0.0
    if pa and pa != pr:
        return False, 0.0
    d = levenshtein(req, alias)
    sim = SequenceMatcher(None, req, alias).ratio()
    if d <= 2 and abs(len(req) - len(alias)) <= 2:
        return True, sim
    if sim >= 0.88:
        return True, sim
    return False, 0.0


def _find_index_match(norm: str) -> Optional[Tuple[Dict[str, Any], str, float]]:
    """
    Returns (entry, match_label, similarity) où match_label est
    exact | alias | fuzzy.
    """
    if len(norm) < 3:
        return None

    entries = _load_entries()
    kind = classify_search_code(norm)

    best: Optional[Tuple[int, Dict[str, Any], str, float]] = None

    for entry in entries:
        code = _norm(entry.get("code", ""))
        if not code:
            continue
        aliases_raw = entry.get("aliases") or []
        aliases = [_norm(str(a)) for a in aliases_raw if _norm(str(a))]

        if norm == code:
            cand: Tuple[int, Dict[str, Any], str, float] = (0, entry, "exact", 1.0)
            if best is None or cand[0] < best[0]:
                best = cand
            continue

        for al in aliases:
            if norm == al:
                cand = (1, entry, "alias", 1.0)
                if best is None or cand[0] < best[0] or (
                    cand[0] == best[0] and cand[3] > best[3]
                ):
                    best = cand
                break

        for al in aliases:
            if norm == al:
                continue
            sim = 0.0
            ok = False
            if kind == "NUMERIC_SHORT":
                ok, sim = _alias_fuzzy_numeric(norm, al)
            elif kind == "ISO_CODE":
                ok, sim = _alias_fuzzy_iso(norm, al, code)
            else:
                continue
            if not ok:
                continue
            if kind == "ISO_CODE":
                prn = _iso_prefix(norm)
                if prn and prn != _iso_prefix(code):
                    continue
            cand = (2, entry, "fuzzy", sim)
            if best is None or cand[0] < best[0] or (
                cand[0] == best[0] and cand[3] > best[3]
            ):
                best = cand

    if best is None:
        return None
    _, entry, label, sim = best
    return entry, label, sim


@dataclass
class _Hit:
    entry: Dict[str, Any]
    match_type: str
    similarity: float


def lookup_demo_index(norm: str) -> Optional[_Hit]:
    r = _find_index_match(norm)
    if not r:
        return None
    entry, label, sim = r
    return _Hit(entry=entry, match_type=label, similarity=sim)


def _yolo_placeholder() -> Dict[str, Any]:
    """Champs YOLO conteneurs (Phase 5) pour le match index démo."""
    try:
        from app.services import yolo_model_manager

        y = yolo_model_manager.placeholder_fields()
        y.pop("yolo_confidence", None)
        return y
    except Exception:
        return {"orientation": "unknown", "yolo_model_mode": None}


def try_demo_index_detection(display_code: str) -> Optional["DetectionResponse"]:
    """
    Si le code correspond à l'index démo, retourne une DetectionResponse complète.
    Sinon None (fallback OCR).
    """
    from app.models.schemas import DetectionResponse

    norm = _norm(display_code)
    if not norm:
        return None

    hit = lookup_demo_index(norm)
    if hit is None:
        log.info("[DEMO_INDEX] aucun match pour %r", norm)
        return None

    entry = hit.entry
    canon = _norm(entry.get("code", ""))
    # Preuve : uniquement le champ « image » de l'entrée indexée (pas d'autre source).
    img_fn = str(entry.get("image") or "").strip()
    if not img_fn or "/" in img_fn or ".." in img_fn or "\\" in img_fn:
        log.error("[DEMO_INDEX] image invalide pour entrée matched=%r : %r", canon, img_fn)
        return None
    cam_id = str(entry.get("camera") or "CAM_DEMO")
    zone = str(entry.get("zone") or "—")
    conf = _conf_to_float(entry.get("confidence", 95))

    img_dir = _images_dir()
    img_path = os.path.join(img_dir, img_fn)
    # URL unique de preuve brute (demo_index) ; annotée sous /results/ si image lue OK.
    evidence_url = f"/demo_images/{img_fn}"
    matched_url = evidence_url
    ann_url: Optional[str] = None
    used_text_fallback = False

    if os.path.isfile(img_path):
        bgr = cv2.imread(img_path, cv2.IMREAD_COLOR)
        if bgr is not None:
            try:
                ann_url = build_evidence_image(
                    bgr,
                    camera_name=cam_id,
                    zone=zone,
                    yolo_bbox=None,
                    ocr_bbox=None,
                    detected_text=canon,
                    ocr_confidence=conf,
                    yolo_confidence=0.0,
                    global_confidence=conf,
                    yolo_detected=False,
                )
            except Exception as e:
                log.warning("[DEMO_INDEX] annotation échouée : %s", e)
                bgr = None
        if bgr is None:
            log.warning(
                "[DEMO_INDEX][FALLBACK] image demo illisible (cv2) — préuve texte. fichier=%r chemin=%s",
                img_fn,
                img_path,
            )
            fb = build_demo_index_text_fallback_image(
                display_code=canon,
                camera_name=cam_id,
                zone=zone,
                expected_demo_filename=img_fn,
            )
            evidence_url = fb
            matched_url = fb
            ann_url = fb
            used_text_fallback = True
    else:
        log.warning(
            "[DEMO_INDEX][FALLBACK] image demo absente — préuve texte. fichier=%r chemin=%s",
            img_fn,
            img_path,
        )
        fb = build_demo_index_text_fallback_image(
            display_code=canon,
            camera_name=cam_id,
            zone=zone,
            expected_demo_filename=img_fn,
        )
        evidence_url = fb
        matched_url = fb
        ann_url = fb
        used_text_fallback = True

    touch_last_analysis(cam_id)

    mt_api = "exact" if hit.match_type == "exact" else ("alias" if hit.match_type == "alias" else "fuzzy")
    msg = f"Conteneur {canon} trouvé via index démo ({img_fn}) — {cam_id} / {zone}."
    if used_text_fallback:
        msg += " (attention : image démo manquante, preuve de secours texte)"

    log.info("[DEMO_INDEX] requested=%s", norm)
    log.info("[DEMO_INDEX] matched_image=%s", img_fn)
    log.info("[DEMO_INDEX] evidence_image_url=%s", f"/demo_images/{img_fn}")
    if used_text_fallback:
        log.warning(
            "[DEMO_INDEX][FALLBACK] réponse API utilise preuve texte (URL réelle): %s",
            evidence_url,
        )

    return DetectionResponse(
        searched_code=display_code,
        detected=True,
        message=msg,
        camera_name=cam_id,
        zone=zone,
        confidence=round(conf, 4),
        image_path=matched_url,
        detected_at=datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        global_confidence=round(conf, 4),
        yolo_confidence=None,
        detection_status="ok",
        yolo_detected=False,
        ocr_confidence=round(conf, 4),
        evidence_image_url=evidence_url,
        annotated_image_url=ann_url,
        requested_code=display_code,
        detected_code=canon,
        matched_image=matched_url,
        match_type=mt_api,
        similarity_score=round(float(hit.similarity), 4),
        exact_match=hit.match_type == "exact",
        fuzzy_match=hit.match_type == "fuzzy",
        match_rejection_reason=None,
        matched_candidate=canon,
        rejected_candidates=None,
        source_match="demo_index",
        # Phase 5 : champs OCR/YOLO (match index fiable, pas de bruit OCR).
        raw_ocr_text=None,
        normalized_codes=[canon] if canon else [],
        matched_code=canon,
        match_score=round(float(hit.similarity), 4),
        ocr_quality=("bon" if hit.match_type == "exact" else "moyen"),
        partial_code_detected=False,
        **_yolo_placeholder(),
    )
