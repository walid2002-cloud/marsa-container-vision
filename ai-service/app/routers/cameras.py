"""Endpoints caméras (simulation multi-caméras multi-frames)."""

import asyncio
import os
import shutil
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from app.services.camera_registry import list_cameras_public
from app.services.camera_analyze_service import analyze_camera, scan_all_cameras
from app.services.demo_detector import get_latest_for_camera, DEMO_IMAGES_DIR
from app.services.camera_frame_simulator import (
    advance_frame,
    get_simulate_status,
    read_current_frame_bytes,
    register_dynamic_frame,
)

router = APIRouter(prefix="/cameras", tags=["cameras"])


class RegisterFrameBody(BaseModel):
    filename: str
    source: str = "upload"
    primary_code: Optional[str] = None


class RtspGrabBody(BaseModel):
    rtsp_url: str


@router.post("/rtsp/test")
async def rtsp_test(body: RtspGrabBody):
    import cv2

    from app.services.rtsp_reader import capture_from_url, mask_rtsp_url

    frame, err, latency_ms = await asyncio.to_thread(capture_from_url, body.rtsp_url)
    if frame is None:
        return {
            "success": False,
            "cameraOnline": False,
            "error": err or "Connexion RTSP impossible",
            "masked_url": mask_rtsp_url(body.rtsp_url),
            "latencyMs": latency_ms,
        }
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    import base64

    b64 = base64.b64encode(buf.tobytes()).decode("ascii") if ok else None
    return {
        "success": True,
        "cameraOnline": True,
        "latencyMs": latency_ms,
        "masked_url": mask_rtsp_url(body.rtsp_url),
        "snapshot_jpeg_b64": b64,
    }


@router.post("/rtsp/grab")
async def rtsp_grab(body: RtspGrabBody):
    """Capture une JPEG. Ne jamais appeler depuis le téléphone avec l’URL RTSP brute côté client métier — proxy Express."""
    import cv2

    from app.services.rtsp_reader import capture_from_url

    frame, err, latency_ms = await asyncio.to_thread(capture_from_url, body.rtsp_url)
    if frame is None:
        raise HTTPException(status_code=502, detail=err or "Connexion RTSP impossible")
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    if not ok:
        raise HTTPException(status_code=500, detail="Encodage JPEG impossible")
    return Response(
        content=buf.tobytes(),
        media_type="image/jpeg",
        headers={"X-Marsa-Latency-Ms": str(int(latency_ms)), "Cache-Control": "no-store"},
    )


@router.get("/")
async def list_cameras():
    """Liste les caméras simulées avec zone, statut, frames et dernière analyse."""
    return {"cameras": list_cameras_public()}


@router.get("/{camera_id}/latest")
async def camera_latest(camera_id: str):
    """Dernière image de démo et métadonnées pour une caméra."""
    data = get_latest_for_camera(camera_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Caméra inconnue : {camera_id}")
    sim = get_simulate_status(camera_id)
    data["simulation"] = sim
    return data


@router.get("/{camera_id}/frames")
async def camera_frames(camera_id: str):
    """Liste des frames et frame courante pour une caméra simulée."""
    status = get_simulate_status(camera_id)
    if not status.get("frames") and status.get("status") == "unknown":
        raise HTTPException(status_code=404, detail=f"Caméra inconnue : {camera_id}")
    return status


@router.post("/{camera_id}/next-frame")
async def camera_next_frame(camera_id: str):
    """Passe manuellement à la frame suivante (simulation live)."""
    frame = await asyncio.to_thread(advance_frame, camera_id)
    if not frame:
        raise HTTPException(status_code=404, detail=f"Aucune frame pour {camera_id}")
    return {"camera_id": camera_id, "current_frame": frame}


@router.post("/scan-all")
async def cameras_scan_all():
    """Analyse OCR (+ YOLO si activé) la frame courante de chaque caméra active."""
    try:
        return await asyncio.to_thread(scan_all_cameras, True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur scan caméras : {e}") from e


@router.post("/{camera_id}/analyze")
async def camera_analyze(camera_id: str):
    """Analyse la frame courante de la caméra simulée."""
    try:
        data = await asyncio.to_thread(analyze_camera, camera_id)
    except MemoryError as e:
        raise HTTPException(
            status_code=503,
            detail="Mémoire insuffisante pour OCR+YOLO. Augmentez la RAM Docker du conteneur ai-service.",
        ) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur analyse caméra : {e}") from e
    if not data:
        raise HTTPException(status_code=404, detail=f"Caméra inconnue ou image indisponible : {camera_id}")
    return data


@router.post("/{camera_id}/register-frame")
async def camera_register_frame(camera_id: str, body: RegisterFrameBody):
    """Enregistre une image déjà présente dans demo_images comme frame de la caméra."""
    path = os.path.join(DEMO_IMAGES_DIR, body.filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Fichier introuvable : {body.filename}")
    entry = await asyncio.to_thread(
        register_dynamic_frame,
        camera_id,
        body.filename,
        body.source,
        body.primary_code,
    )
    return {"success": True, "frame": entry, "status": get_simulate_status(camera_id)}


@router.post("/{camera_id}/attach-upload")
async def camera_attach_upload(
    camera_id: str,
    file: UploadFile = File(...),
    primary_code: Optional[str] = Form(None),
    source: str = Form("upload"),
):
    """Copie une image uploadée dans demo_images et l'associe à la caméra."""
    import time
    import uuid

    ext = os.path.splitext(file.filename or "upload.png")[1] or ".png"
    safe_cam = camera_id.lower().replace("_", "")
    fname = f"{safe_cam}_upload_{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
    dest = os.path.join(DEMO_IMAGES_DIR, fname)
    content = await file.read()
    with open(dest, "wb") as out:
        out.write(content)
    entry = register_dynamic_frame(camera_id, fname, source, primary_code)
    return {"success": True, "filename": fname, "frame": entry, "image_url": f"/demo_images/{fname}"}


@router.get("/{camera_id}/live-preview")
async def camera_live_preview(camera_id: str):
    """
    JPEG/PNG de la frame simulée courante (rotation automatique multi-frames).
    Fallback RTSP cache si disponible.
    """
    from app.services import rtsp_reader

    jpg = rtsp_reader.get_cached_jpeg(camera_id)
    if jpg:
        return Response(
            content=jpg,
            media_type="image/jpeg",
            headers={"X-Marsa-Source": "rtsp-cache"},
        )

    payload = await asyncio.to_thread(read_current_frame_bytes, camera_id)
    if payload:
        data, mt = payload
        return Response(
            content=data,
            media_type=mt,
            headers={
                "X-Marsa-Source": "simulation",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )

    raise HTTPException(
        status_code=404,
        detail="Aucune frame simulée disponible pour cette caméra.",
    )
