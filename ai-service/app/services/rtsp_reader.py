"""
Lecture RTSP via OpenCV — capture, timeout, reconnexion, cache multi-caméras.

Si aucune source RTSP valide n’est disponible, les fonctions retournent None
et l’application reste en mode démo (images locales).
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("marsa.rtsp")

RTSP_CONFIG_PATH = os.getenv("RTSP_SOURCES_FILE", "/app/rtsp_sources.json")
RTSP_ENABLED = os.getenv("RTSP_ENABLED", "true").lower() in ("1", "true", "yes")
RTSP_OPEN_TIMEOUT_MS = int(os.getenv("RTSP_OPEN_TIMEOUT_MS", "8000"))
RTSP_READ_TIMEOUT_SEC = float(os.getenv("RTSP_READ_TIMEOUT_SEC", "6"))
RTSP_RECONNECT_DELAY_SEC = float(os.getenv("RTSP_RECONNECT_DELAY_SEC", "3"))
RTSP_FPS = float(os.getenv("RTSP_CAPTURE_FPS", "1.0"))

_last_frames: Dict[str, Tuple[Optional[np.ndarray], float, str]] = {}
_frame_lock = threading.Lock()
_threads: Dict[str, threading.Thread] = {}
_stop_evt = threading.Event()


def load_rtsp_config() -> Dict[str, Any]:
    if not os.path.isfile(RTSP_CONFIG_PATH):
        logger.warning("Fichier RTSP absent : %s", RTSP_CONFIG_PATH)
        return {"sources": []}
    with open(RTSP_CONFIG_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    data.pop("_comment", None)
    return data


def _open_capture(url: str) -> cv2.VideoCapture:
    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    try:
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, RTSP_OPEN_TIMEOUT_MS)
    except Exception:
        pass
    try:
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, int(RTSP_READ_TIMEOUT_SEC * 1000))
    except Exception:
        pass
    return cap


def mask_rtsp_url(url: str) -> str:
    """Jamais de credentials dans les logs / réponses."""
    raw = str(url or "").strip()
    if not raw:
        return ""
    try:
        # URL() n’accepte pas rtsp nativement partout : on force http pour parser.
        probe = raw.replace("rtsp://", "http://", 1).replace("rtsps://", "https://", 1)
        from urllib.parse import urlparse

        p = urlparse(probe)
        host = p.hostname or "****"
        port = f":{p.port}" if p.port else ""
        scheme = "rtsp" if raw.lower().startswith("rtsp") else "rtsps"
        return f"{scheme}://{host}{port}/****"
    except Exception:
        return "rtsp://****"


def capture_from_url(url: str) -> Tuple[Optional[np.ndarray], Optional[str], float]:
    """Ouvre un RTSP une fois, lit une frame. Ne logue jamais l’URL complète."""
    t0 = time.time()
    if not RTSP_ENABLED:
        return None, "RTSP_ENABLED=false", 0.0
    u = str(url or "").strip()
    if not u:
        return None, "URL RTSP vide", 0.0
    cap = _open_capture(u)
    if not cap.isOpened():
        cap.release()
        return None, f"Ouverture impossible ({mask_rtsp_url(u)})", round((time.time() - t0) * 1000)
    frame = None
    while time.time() - t0 < RTSP_READ_TIMEOUT_SEC:
        ok, fr = cap.read()
        if ok and fr is not None and fr.size > 0:
            frame = fr
            break
        time.sleep(0.05)
    cap.release()
    ms = round((time.time() - t0) * 1000)
    if frame is None:
        return None, f"Timeout lecture ({mask_rtsp_url(u)})", ms
    return frame, None, ms


def capture_frame(camera_id: str) -> Optional[np.ndarray]:
    """
    Capture une frame unique (bloquant) pour la caméra donnée.
    Retourne BGR ou None (démo / flux indisponible).
    """
    if not RTSP_ENABLED:
        return None
    cfg = load_rtsp_config()
    for src in cfg.get("sources", []):
        if src.get("camera_id") != camera_id:
            continue
        if not src.get("enabled") or not src.get("rtsp_url"):
            return None
        url = str(src["rtsp_url"]).strip()
        cap = _open_capture(url)
        if not cap.isOpened():
            logger.error("[RTSP] Ouverture impossible cam=%s %s", camera_id, mask_rtsp_url(url))
            cap.release()
            return None
        t0 = time.time()
        frame = None
        while time.time() - t0 < RTSP_READ_TIMEOUT_SEC:
            ok, fr = cap.read()
            if ok and fr is not None and fr.size > 0:
                frame = fr
                break
            time.sleep(0.05)
        cap.release()
        if frame is None:
            logger.error("[RTSP] Timeout lecture cam=%s", camera_id)
        else:
            logger.info("[RTSP] Frame capturée cam=%s shape=%s", camera_id, frame.shape)
        return frame
    return None


def is_rtsp_available(camera_id: str) -> bool:
    cfg = load_rtsp_config()
    for src in cfg.get("sources", []):
        if src.get("camera_id") == camera_id:
            return bool(src.get("enabled") and src.get("rtsp_url"))
    return False


def rtsp_sources_status() -> List[Dict[str, Any]]:
    """Résumé pour health checks."""
    out: List[Dict[str, Any]] = []
    for src in load_rtsp_config().get("sources", []):
        cid = src.get("camera_id")
        with _frame_lock:
            _, ts, st = _last_frames.get(cid, (None, 0.0, "never"))
        out.append({
            "camera_id": cid,
            "enabled": bool(src.get("enabled")),
            "has_url": bool(src.get("rtsp_url")),
            "last_status": st,
            "last_frame_age_sec": round(time.time() - ts, 1) if ts else None,
        })
    return out


def get_cached_frame(camera_id: str) -> Optional[np.ndarray]:
    with _frame_lock:
        tup = _last_frames.get(camera_id)
        if not tup or tup[0] is None:
            return None
        return tup[0].copy()


def get_cached_jpeg(camera_id: str, quality: int = 82) -> Optional[bytes]:
    fr = get_cached_frame(camera_id)
    if fr is None:
        return None
    ok, buf = cv2.imencode(".jpg", fr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return buf.tobytes() if ok else None


def _reader_loop(camera_id: str, url: str) -> None:
    delay = max(0.2, 1.0 / max(RTSP_FPS, 0.1))
    backoff = RTSP_RECONNECT_DELAY_SEC
    while not _stop_evt.is_set():
        cap = None
        try:
            cap = _open_capture(url)
            if not cap.isOpened():
                raise RuntimeError("VideoCapture not opened")
            logger.info("[RTSP] Connecté cam=%s", camera_id)
            while not _stop_evt.is_set():
                ok, fr = cap.read()
                if not ok or fr is None or fr.size == 0:
                    logger.warning("[RTSP] Frame vide cam=%s → reconnexion", camera_id)
                    with _frame_lock:
                        _last_frames[camera_id] = (None, time.time(), "read_error")
                    break
                with _frame_lock:
                    _last_frames[camera_id] = (fr, time.time(), "ok")
                time.sleep(delay)
        except Exception as e:
            logger.exception("[RTSP] Erreur cam=%s : %s", camera_id, e)
            with _frame_lock:
                _last_frames[camera_id] = (None, time.time(), f"error:{e}")
        finally:
            if cap is not None:
                cap.release()
        time.sleep(backoff)


def start_rtsp_monitors_background() -> None:
    """Démarre un thread par source RTSP activée (idempotent par caméra)."""
    if not RTSP_ENABLED:
        logger.info("[RTSP] Monitors désactivés (RTSP_ENABLED=false).")
        return
    cfg = load_rtsp_config()
    for src in cfg.get("sources", []):
        cid = src.get("camera_id")
        if not cid or not src.get("enabled") or not src.get("rtsp_url"):
            continue
        if cid in _threads and _threads[cid].is_alive():
            continue
        url = str(src["rtsp_url"]).strip()
        t = threading.Thread(target=_reader_loop, args=(cid, url), name=f"rtsp-{cid}", daemon=True)
        _threads[cid] = t
        t.start()
        logger.info("[RTSP] Thread démarré cam=%s", cid)


def stop_rtsp_monitors() -> None:
    _stop_evt.set()
    for t in _threads.values():
        t.join(timeout=2.0)
