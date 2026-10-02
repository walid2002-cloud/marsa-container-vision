"""
Workers Celery — tâches asynchrones OCR / YOLO / détection complète.

Broker + backend Redis (REDIS_URL). Désactivé côté API si CELERY_ENABLED=false.
"""

from __future__ import annotations

import os

from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "marsa_ai",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks_workers"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    result_expires=3600,
)
