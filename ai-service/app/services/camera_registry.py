"""
Registre des caméras de démo (fichier demo_cameras.json).

Schéma v2 :
  - "cameras" : liste d'objets { id, name, zone, status, demo_image }
  - "images" : { "fichier.png": "CAM_01" }  (camera_id)

Rétrocompatibilité : si seules les clés fichier → {camera_name, zone} existent,
elles sont converties automatiquement.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

DEMO_CAMERAS_FILE = os.getenv("DEMO_CAMERAS_FILE", "/app/demo_cameras.json")
DEMO_IMAGES_DIR = os.getenv("DEMO_IMAGES_DIR", "/app/demo_images")

_cache: Optional[Tuple[Dict[str, Any], List[Dict[str, Any]]]] = None
_last_analysis: Dict[str, str] = {}


def _empty_registry() -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    return {"images": {}, "legacy": {}}, []


def load_camera_registry(force_reload: bool = False) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Returns:
        (registry_dict, cameras_list)
        registry_dict keys: images (filename -> camera_id), legacy (optional)
    """
    global _cache
    if _cache is not None and not force_reload:
        return _cache

    if not os.path.exists(DEMO_CAMERAS_FILE):
        _cache = _empty_registry()
        return _cache

    with open(DEMO_CAMERAS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    data.pop("_comment", None)
    data.pop("_schema", None)

    cameras: List[Dict[str, Any]] = []
    images_map: Dict[str, str] = {}
    legacy: Dict[str, Any] = {}

    if isinstance(data.get("cameras"), list) and isinstance(data.get("images"), dict):
        cameras = data["cameras"]
        for fname, cam_id in data["images"].items():
            images_map[fname] = cam_id
    else:
        # Ancien format : { "file.png": { "camera_name", "zone" } }
        for key, val in data.items():
            if not isinstance(val, dict):
                continue
            if "camera_name" in val:
                legacy[key] = val
                cid = val.get("camera_name", "CAM_DEMO")
                images_map[key] = cid
                if not any(c.get("id") == cid for c in cameras):
                    cameras.append({
                        "id": cid,
                        "name": cid,
                        "zone": val.get("zone", "—"),
                        "status": "active",
                        "demo_image": key,
                    })

    reg = {"images": images_map, "legacy": legacy}
    _cache = (reg, cameras)
    return _cache


def get_camera_by_id(camera_id: str) -> Optional[Dict[str, Any]]:
    _, cameras = load_camera_registry()
    for c in cameras:
        if c.get("id") == camera_id or c.get("name") == camera_id:
            return dict(c)
    return None


def get_camera_info_for_image(filename: str) -> Dict[str, str]:
    """Retourne camera_name, zone, camera_id, status pour une image de démo."""
    reg, cameras = load_camera_registry()
    images_map = reg.get("images") or {}
    legacy = reg.get("legacy") or {}

    cam_id = images_map.get(filename)
    if cam_id:
        cam = get_camera_by_id(cam_id)
        if cam:
            return {
                "camera_id": cam["id"],
                "camera_name": cam.get("name", cam["id"]),
                "zone": cam.get("zone", "—"),
                "status": cam.get("status", "active"),
            }

    if filename in legacy:
        v = legacy[filename]
        return {
            "camera_id": v.get("camera_name", "CAM_DEMO"),
            "camera_name": v.get("camera_name", "CAM_DEMO"),
            "zone": v.get("zone", "—"),
            "status": "active",
        }

    return {
        "camera_id": "CAM_DEMO",
        "camera_name": "CAM_DEMO",
        "zone": "Zone inconnue (non mappée dans demo_cameras.json)",
        "status": "unknown",
    }


def touch_last_analysis(camera_id: str) -> None:
    _last_analysis[camera_id] = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def get_last_analysis_time(camera_id: str) -> Optional[str]:
    return _last_analysis.get(camera_id)


def list_cameras_public() -> List[Dict[str, Any]]:
    """Pour GET /cameras — enrichit avec last_analysis_time, frames et frame courante."""
    from app.services.camera_frame_simulator import get_simulate_status

    _, cameras = load_camera_registry()
    out = []
    for c in cameras:
        cid = c.get("id")
        last = get_last_analysis_time(cid) if cid else None
        if not last and cid:
            demo_img = c.get("demo_image")
            if demo_img:
                p = os.path.join(DEMO_IMAGES_DIR, demo_img)
                if os.path.isfile(p):
                    last = (
                        datetime.utcfromtimestamp(os.path.getmtime(p))
                        .replace(microsecond=0)
                        .isoformat()
                        + "Z"
                    )
        sim = get_simulate_status(cid) if cid else {}
        current = sim.get("current_frame") or {}
        item = {
            "id": cid,
            "name": c.get("name", cid),
            "zone": c.get("zone", "—"),
            "status": c.get("status", "active"),
            "demo_image": c.get("demo_image"),
            "last_analysis_time": last,
            "frame_count": sim.get("frame_count", 0),
            "current_frame": current,
            "current_frame_url": current.get("url"),
            "known_container_codes": sim.get("known_container_codes") or [],
            "simulation_mode": True,
            "rtsp_connected": False,
        }
        out.append(item)
    return out
