"""File d'attente asynchrone Celery — statuts pending / processing / done / failed."""

from __future__ import annotations

import os

from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException

from app.models.schemas import DetectionRequest

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _celery_enabled() -> bool:
    return os.getenv("CELERY_ENABLED", "false").lower() in ("1", "true", "yes")


def _map_state(celery_state: str) -> str:
    s = (celery_state or "").upper()
    if s in ("PENDING",):
        return "pending"
    if s in ("STARTED", "RETRY", "PROGRESS"):
        return "processing"
    if s in ("SUCCESS",):
        return "done"
    if s in ("FAILURE", "REVOKED"):
        return "failed"
    return "processing"


@router.post("/detect")
async def enqueue_detect(req: DetectionRequest):
    if not _celery_enabled():
        raise HTTPException(status_code=503, detail="Celery désactivé (CELERY_ENABLED=false).")
    if not req.container_code or not req.container_code.strip():
        raise HTTPException(status_code=400, detail="container_code requis.")
    from app.tasks_workers import task_full_detection

    async_result = task_full_detection.delay(req.container_code.strip())
    return {"task_id": async_result.id, "status": "pending"}


@router.get("/detect/{task_id}")
async def detect_job_status(task_id: str):
    if not _celery_enabled():
        raise HTTPException(status_code=503, detail="Celery désactivé.")
    from app.celery_worker import celery_app

    r = AsyncResult(task_id, app=celery_app)
    status = _map_state(r.state)
    out: dict = {"task_id": task_id, "status": status}
    if r.failed():
        out["error"] = str(r.result) if r.result else "failure"
    elif r.successful():
        out["result"] = r.result
    else:
        out["meta"] = r.info if isinstance(r.info, dict) else None
    return out
