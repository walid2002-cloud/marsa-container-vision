"""
Modèles Pydantic pour le service IA.

Ces schémas définissent le contrat d'interface entre le backend Express
et le service de détection FastAPI. Toute modification de ces modèles
impacte la communication entre les deux services.
"""

from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional


class DetectionRequest(BaseModel):
    """Requête de recherche d'un conteneur par son code."""
    container_code: str = Field(..., description="Identifiant du conteneur recherché")


class DetectionResponse(BaseModel):
    """
    Réponse structurée d'une détection.

    Ce modèle est identique que la détection provienne du mode mock
    ou du futur mode réel (YOLO + OCR). Cela garantit que le backend
    n'a pas besoin de changer quand on passe en mode production.
    """
    searched_code: str = Field(..., description="Code recherché par l'utilisateur")
    detected: bool = Field(..., description="True si le conteneur a été trouvé")
    message: str = Field(..., description="Message lisible décrivant le résultat")
    camera_name: Optional[str] = Field(None, description="Nom de la caméra ayant détecté")
    zone: Optional[str] = Field(None, description="Zone géographique de la détection")
    confidence: float = Field(0.0, description="Score de confiance OCR principal [0.0 - 1.0]")
    image_path: Optional[str] = Field(None, description="Chemin vers l'image de preuve")
    detected_at: Optional[str] = Field(None, description="Date/heure de la détection (ISO)")
    global_confidence: Optional[float] = Field(
        None,
        description="Score global 0-1 (OCR + YOLO pondéré ; YOLO optionnel)",
    )
    yolo_confidence: Optional[float] = Field(
        None,
        description="Confiance YOLO si disponible, sinon null",
    )
    detection_status: str = Field(
        "ok",
        description="ok | low_confidence | invalid_code",
    )
    yolo_detected: Optional[bool] = Field(
        None,
        description="True si une ROI YOLO a été utilisée avant OCR",
    )
    ocr_confidence: Optional[float] = Field(
        None,
        description="Confiance OCR explicite (0–1), alignée sur le champ confidence quand YOLO actif",
    )
    evidence_image_url: Optional[str] = Field(
        None,
        description="URL de l’image source (preuve brute), ex. /demo_images/...",
    )
    annotated_image_url: Optional[str] = Field(
        None,
        description="URL de l’image annotée sauvegardée sous /results/",
    )
    requested_code: Optional[str] = Field(
        None,
        description="Code demandé (aligné sur l’entrée utilisateur ; alias de searched_code si renseigné)",
    )
    detected_code: Optional[str] = Field(
        None,
        description="Code conteneur réellement apparié après matching fiable",
    )
    matched_image: Optional[str] = Field(
        None,
        description="Chemin ou URL de l’image de preuve alignée sur image_path / evidence",
    )
    match_type: Optional[str] = Field(
        None,
        description="none | exact | fuzzy",
    )
    similarity_score: Optional[float] = Field(
        None,
        description="Score de similarité du match (0–1) pour fuzzy / substring",
    )
    exact_match: Optional[bool] = Field(
        None,
        description="True si égalité stricte après normalisation",
    )
    fuzzy_match: Optional[bool] = Field(
        None,
        description="True si accord tolérant (fuzzy)",
    )
    match_rejection_reason: Optional[str] = Field(
        None,
        description="Si detected=false : synthèse machine de la dernière tentative de match",
    )
    matched_candidate: Optional[str] = Field(
        None,
        description="Code OCR retenu pour le match (souvent identique à detected_code)",
    )
    rejected_candidates: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Mode debug : candidats OCR écartés avec raison courte",
    )
    source_match: Optional[str] = Field(
        None,
        description="demo_index | ocr | yolo | mock_registry | none — origine du match",
    )
    images_analyzed: Optional[int] = Field(
        None,
        description="Nombre d'images caméra analysées lors du scan OCR démo",
    )
    cameras_scanned: Optional[int] = Field(
        None,
        description="Nombre de caméras simulées parcourues (alias images_analyzed en mode démo)",
    )

    # ── Phase 5 : OCR avancé ─────────────────────────────────────────
    raw_ocr_text: Optional[str] = Field(
        None, description="Texte OCR brut concaténé (traçabilité)"
    )
    normalized_codes: Optional[List[str]] = Field(
        None, description="Codes candidats normalisés extraits de l'OCR"
    )
    matched_code: Optional[str] = Field(
        None, description="Code OCR retenu après matching (alias de detected_code)"
    )
    match_score: Optional[float] = Field(
        None, description="Score de matching normalisé 0–1 (exact=1.0)"
    )
    ocr_quality: Optional[str] = Field(
        None, description="bon | moyen | faible | à vérifier"
    )
    partial_code_detected: Optional[bool] = Field(
        None, description="True si le code n'est que partiellement visible/lisible"
    )
    partial_code_reason: Optional[str] = Field(
        None, description="Explication machine du caractère partiel du code"
    )

    # ── Phase 5 : champs YOLO conteneurs (préparés pour modèle custom) ─
    container_detected: Optional[bool] = Field(
        None, description="Conteneur détecté par YOLO (custom uniquement)"
    )
    container_confidence: Optional[float] = Field(
        None, description="Confiance détection conteneur (custom uniquement)"
    )
    code_area_detected: Optional[bool] = Field(
        None, description="Zone du numéro détectée (custom uniquement)"
    )
    code_area_confidence: Optional[float] = Field(
        None, description="Confiance de la zone du numéro (custom uniquement)"
    )
    orientation: Optional[str] = Field(
        "unknown",
        description="front | back | left_side | right_side | angled | unknown",
    )
    door_detected: Optional[bool] = Field(
        None, description="Portes de conteneur détectées (custom uniquement)"
    )
    seal_detected: Optional[bool] = Field(
        None, description="Scellé détecté (custom uniquement)"
    )
    yolo_model_mode: Optional[str] = Field(
        None, description="disabled | experimental | custom | unavailable"
    )


class BoundingBox(BaseModel):
    """
    Coordonnées d'une bounding box YOLO.

    TODO (futur) : Utilisé quand YOLO sera intégré pour localiser
    les conteneurs ou les zones de numéro dans une frame.
    """
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float = 0.0
    class_name: str = ""


class OCRResult(BaseModel):
    """
    Résultat de la lecture OCR sur une image.

    TODO (futur) : Utilisé quand l'OCR sera intégré pour retourner
    le texte détecté sur un crop de conteneur.
    """
    text: str = Field("", description="Texte brut détecté")
    normalized_text: str = Field("", description="Texte nettoyé et normalisé")
    confidence: float = Field(0.0, description="Score de confiance OCR")


class CameraFrame(BaseModel):
    """
    Représentation d'une frame capturée depuis une caméra.

    TODO (futur) : Utilisé quand les caméras RTSP seront connectées.
    """
    camera_name: str
    zone: str
    image_path: str
    captured_at: str


# ── Schémas expérimentaux (image fixe) ───────────────────────────

class ExperimentalOCRDetection(BaseModel):
    """Un texte détecté par EasyOCR dans une image."""
    text: str
    confidence: float
    bbox: List[List[int]]


class ExtractedCode(BaseModel):
    """Un code de conteneur extrait depuis du texte OCR."""
    raw_text: str
    normalized_code: str
    pattern_type: str


class ExperimentalDetectionResponse(BaseModel):
    """
    Réponse du pipeline expérimental sur image fixe.

    Ce schéma est utilisé uniquement par les routes /experimental/*.
    Il n'impacte pas la route /detect existante.
    """
    experimental: bool = True
    pipeline_mode: str = Field(..., description="ocr_only ou yolo_ocr")
    ocr_detections: Optional[List[ExperimentalOCRDetection]] = None
    extracted_codes: List[ExtractedCode] = []
    searched_code: Optional[str] = None
    match_found: bool = False
    matched_text: Optional[str] = None
    processing_time_ms: float = 0.0
    message: str = ""
    warnings: List[str] = []
    timestamp: Optional[str] = None
