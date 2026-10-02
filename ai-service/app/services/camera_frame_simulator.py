"""
Simulation de flux caméra multi-frames (images démo, frames vidéo, uploads).

Chaque caméra possède une liste de frames qui défilent automatiquement
(rotation temporelle) ou manuellement (next-frame).
"""

from __future__ import annotations

import json
import mimetypes
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.services.camera_registry import (
    DEMO_CAMERAS_FILE,
    DEMO_IMAGES_DIR,
    get_camera_by_id,
    load_camera_registry,
)

DYNAMIC_FRAMES_FILE = os.getenv(
    "CAMERA_DYNAMIC_FRAMES_FILE", "/app/camera_dynamic_frames.json"
)
FRAME_INTERVAL_SEC = float(os.getenv("CAMERA_FRAME_INTERVAL_SEC", "5"))

_manual_offset: Dict[str, int] = {}
_frame_meta_cache: Dict[str, Dict[str, Any]] = {}


def _load_dynamic_frames() -> Dict[str, List[Dict[str, Any]]]:
    if not os.path.isfile(DYNAMIC_FRAMES_FILE):
        return {}
    try:
        with open(DYNAMIC_FRAMES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        raw = data.get("frames") or {}
        out: Dict[str, List[Dict[str, Any]]] = {}
        for cam_id, items in raw.items():
            if isinstance(items, list):
                out[cam_id] = [i for i in items if isinstance(i, dict)]
        return out
    except Exception:
        return {}


def get_frames_for_camera(camera_id: str) -> List[Dict[str, Any]]:
    """Liste ordonnée des frames d'une caméra (démo + dynamiques)."""
    cam = get_camera_by_id(camera_id)
    if not cam:
        return []

    reg, _ = load_camera_registry()
    images_map: Dict[str, str] = reg.get("images") or {}
    demo_files = sorted(
        fname for fname, cid in images_map.items() if cid == camera_id
    )

    frames: List[Dict[str, Any]] = []
    seen = set()
    primary = cam.get("demo_image")
    ordered = ([primary] if primary else []) + [f for f in demo_files if f != primary]

    for fname in ordered:
        if not fname or fname in seen:
            continue
        path = os.path.join(DEMO_IMAGES_DIR, fname)
        if not os.path.isfile(path):
            continue
        seen.add(fname)
        frames.append({
            "filename": fname,
            "source": "demo",
            "url": f"/demo_images/{fname}",
            "local_path": path,
        })

    for item in _load_dynamic_frames().get(camera_id, []):
        fname = item.get("filename") or item.get("id")
        if not fname or fname in seen:
            continue
        local = item.get("local_path") or os.path.join(DEMO_IMAGES_DIR, fname)
        if not os.path.isfile(local):
            continue
        seen.add(fname)
        frames.append({
            "filename": fname,
            "source": item.get("source", "upload"),
            "url": item.get("url") or f"/demo_images/{fname}",
            "local_path": local,
            "primary_code": item.get("primary_code"),
        })

    return frames


def _current_index(camera_id: str, frame_count: int) -> int:
    if frame_count <= 0:
        return 0
    auto = int(time.time() / FRAME_INTERVAL_SEC) if frame_count > 1 else 0
    manual = _manual_offset.get(camera_id, 0)
    return (auto + manual) % frame_count


def get_current_frame(camera_id: str) -> Optional[Dict[str, Any]]:
    frames = get_frames_for_camera(camera_id)
    if not frames:
        return None
    idx = _current_index(camera_id, len(frames))
    frame = dict(frames[idx])
    frame["index"] = idx
    frame["frame_count"] = len(frames)
    frame["simulated_at"] = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    return frame


def advance_frame(camera_id: str) -> Optional[Dict[str, Any]]:
    frames = get_frames_for_camera(camera_id)
    if not frames:
        return None
    _manual_offset[camera_id] = _manual_offset.get(camera_id, 0) + 1
    return get_current_frame(camera_id)


def get_simulate_status(camera_id: str) -> Dict[str, Any]:
    cam = get_camera_by_id(camera_id)
    frames = get_frames_for_camera(camera_id)
    current = get_current_frame(camera_id)
    known_codes: List[str] = []
    for fr in frames:
        code = fr.get("primary_code")
        if code and code not in known_codes:
            known_codes.append(code)
        meta = _frame_meta_cache.get(f"{camera_id}:{fr.get('filename')}")
        if meta:
            for c in meta.get("extracted_codes") or []:
                nc = c.get("normalized_code") if isinstance(c, dict) else c
                if nc and nc not in known_codes:
                    known_codes.append(nc)

    return {
        "camera_id": camera_id,
        "zone": cam.get("zone") if cam else None,
        "status": cam.get("status") if cam else "unknown",
        "frame_count": len(frames),
        "frames": [
            {
                "filename": f["filename"],
                "source": f.get("source", "demo"),
                "url": f.get("url"),
                "primary_code": f.get("primary_code"),
            }
            for f in frames
        ],
        "current_frame": current,
        "known_container_codes": known_codes,
        "frame_interval_sec": FRAME_INTERVAL_SEC,
        "rtsp_connected": False,
        "simulation_mode": True,
    }


def read_current_frame_bytes(camera_id: str) -> Optional[Tuple[bytes, str]]:
    """Retourne (bytes, media_type) de la frame courante."""
    frame = get_current_frame(camera_id)
    if not frame:
        return None
    path = frame.get("local_path")
    if not path or not os.path.isfile(path):
        return None
    mt, _ = mimetypes.guess_type(path)
    with open(path, "rb") as f:
        return f.read(), mt or "image/jpeg"


def cache_frame_analysis(camera_id: str, filename: str, extracted_codes: List[Any]) -> None:
    _frame_meta_cache[f"{camera_id}:{filename}"] = {
        "extracted_codes": extracted_codes,
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
    }


def register_dynamic_frame(
    camera_id: str,
    filename: str,
    source: str = "upload",
    primary_code: Optional[str] = None,
) -> Dict[str, Any]:
    """Enregistre une frame dans camera_dynamic_frames.json (persistant)."""
    data: Dict[str, Any] = {"frames": {}}
    if os.path.isfile(DYNAMIC_FRAMES_FILE):
        try:
            with open(DYNAMIC_FRAMES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    frames_map = data.setdefault("frames", {})
    items: List[Dict[str, Any]] = list(frames_map.get(camera_id) or [])
    entry = {
        "filename": filename,
        "source": source,
        "url": f"/demo_images/{filename}",
        "local_path": os.path.join(DEMO_IMAGES_DIR, filename),
        "primary_code": primary_code,
        "added_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    }
    if not any(i.get("filename") == filename for i in items):
        items.append(entry)
    frames_map[camera_id] = items

    with open(DYNAMIC_FRAMES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    # Mettre à jour demo_cameras.json images map si possible
    _append_to_cameras_registry(camera_id, filename)
    load_camera_registry(force_reload=True)
    return entry


def _append_to_cameras_registry(camera_id: str, filename: str) -> None:
    if not os.path.isfile(DEMO_CAMERAS_FILE):
        return
    try:
        with open(DEMO_CAMERAS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        images = data.setdefault("images", {})
        if images.get(filename) != camera_id:
            images[filename] = camera_id
            with open(DEMO_CAMERAS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception:
        pass
