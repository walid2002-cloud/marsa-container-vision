"""
Phase 5 — Qualité OCR et détection de code partiel.

Classe la fiabilité d'une lecture OCR de code conteneur et détecte les cas où
le numéro n'est que partiellement visible (obstacle, préfixe seul, derniers
chiffres seulement, texte OCR incomplet mais proche du code recherché).

Valeurs de qualité :
  - bon        : code complet détecté, score élevé, OCR net
  - moyen      : code détecté avec petites corrections OCR ou score moyen
  - faible     : code partiel ou OCR bruité
  - à vérifier : doute important ou résultat incohérent
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

QUALITY_GOOD = "bon"
QUALITY_MEDIUM = "moyen"
QUALITY_LOW = "faible"
QUALITY_UNSURE = "à vérifier"

# Une qualité faible / à vérifier déclenche une alerte OCR_SUSPICIOUS côté backend.
SUSPICIOUS_QUALITIES = frozenset({QUALITY_LOW, QUALITY_UNSURE})


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def classify_ocr_quality(
    *,
    matched: bool,
    match_type: Optional[str],
    score: Optional[float],
    ocr_avg: Optional[float],
    partial: bool,
    has_codes: bool,
) -> str:
    """
    Classe la qualité OCR selon le résultat de matching et la confiance moyenne.

    - ``match_type`` attendu au format API : ``exact`` | ``fuzzy`` | ``none`` | None.
    - ``score`` : score de matching normalisé 0–1.
    - ``ocr_avg`` : confiance moyenne EasyOCR 0–1.
    """
    score_v = _to_float(score)
    ocr_v = _to_float(ocr_avg)
    mtype = (match_type or "").lower()

    if matched and not partial:
        if mtype == "exact" and score_v >= 0.9 and ocr_v >= 0.6:
            return QUALITY_GOOD
        if score_v >= 0.8:
            return QUALITY_MEDIUM
        return QUALITY_LOW

    if partial:
        # Code partiel : jamais « bon », au mieux « faible », sinon « à vérifier ».
        return QUALITY_LOW if (matched or ocr_v >= 0.4) else QUALITY_UNSURE

    # Pas de correspondance fiable.
    if has_codes:
        return QUALITY_UNSURE if ocr_v >= 0.4 else QUALITY_LOW
    return QUALITY_UNSURE


def is_suspicious(quality: Optional[str]) -> bool:
    """True si la qualité doit déclencher une alerte OCR_SUSPICIOUS."""
    return (quality or "") in SUSPICIOUS_QUALITIES


def detect_partial_code(
    search_normalized: Optional[str],
    extracted_codes: Optional[List[Dict[str, Any]]],
    matched: Optional[Dict[str, Any]],
) -> Tuple[bool, Optional[str]]:
    """
    Détecte un code partiellement visible / partiellement caché.

    Retourne ``(partial_code_detected, reason)``.

    Cas gérés :
      - seuls les 4 / 6 derniers chiffres sont visibles ;
      - préfixe ISO visible mais numéro incomplet ;
      - code coupé (un candidat est sous-chaîne du code recherché) ;
      - match fuzzy plus court que le code recherché.
    """
    s = (search_normalized or "").strip().upper()
    if not s:
        return False, None

    # Un match exact n'est jamais partiel.
    if matched and matched.get("exact_match"):
        return False, None

    codes = [
        str(c.get("normalized_code") or "").upper()
        for c in (extracted_codes or [])
        if c
    ]

    for c in codes:
        if not c or c == s:
            continue
        if len(c) >= 3 and (s.endswith(c) or c.endswith(s)):
            return True, f"suffixe_partiel:{c}"
        if len(c) >= 4 and (c in s or s in c):
            return True, f"code_tronque:{c}"
        # Préfixe ISO (4 lettres) visible mais numéro incomplet côté OCR.
        if len(s) >= 4 and c[:4] == s[:4] and c[:4].isalpha() and c != s and len(c) < len(s):
            return True, f"prefixe_iso_numero_incomplet:{c}"

    if matched:
        cand = str(matched.get("normalized_code") or "").upper()
        sim = _to_float(matched.get("similarity_score"), 1.0)
        if cand and cand != s and (len(cand) < len(s) or sim < 0.95):
            return True, f"fuzzy_partiel:{cand}"

    return False, None


def compute_match_score(matched: Optional[Dict[str, Any]], global_score: Optional[float]) -> float:
    """
    Score de matching normalisé 0–1 pour l'API.

    - exact  → 1.0
    - fuzzy  → similarity_score
    - sinon  → score global disponible ou 0.0
    """
    if matched:
        if matched.get("exact_match"):
            return 1.0
        sim = matched.get("similarity_score")
        if sim is not None:
            return round(_to_float(sim), 4)
    return round(_to_float(global_score), 4)


def build_ocr_summary(
    *,
    search_normalized: Optional[str],
    extracted_codes: Optional[List[Dict[str, Any]]],
    matched: Optional[Dict[str, Any]],
    ocr_texts: Optional[List[str]],
    ocr_avg: Optional[float],
    global_score: Optional[float] = None,
    match_type_api: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Construit le bloc de champs OCR avancés commun à tous les endpoints :

      raw_ocr_text, normalized_codes, matched_code, match_score, match_type,
      ocr_quality, partial_code_detected, had_ocr_corrections.
    """
    codes = extracted_codes or []
    normalized_codes: List[str] = []
    had_corrections = False
    for c in codes:
        nc = str(c.get("normalized_code") or "").strip()
        if nc and nc not in normalized_codes:
            normalized_codes.append(nc)
        raw = str(c.get("raw_text") or "").strip().upper()
        raw_alnum = "".join(ch for ch in raw if ch.isalnum())
        if nc and raw_alnum and raw_alnum != nc:
            had_corrections = True

    matched_code = None
    if matched:
        matched_code = matched.get("normalized_code") or matched.get("matched_candidate")
        if match_type_api is None:
            from app.services.fuzzy_match_service import map_internal_match_type_to_api

            match_type_api = map_internal_match_type_to_api(matched.get("match_type"))

    partial, partial_reason = detect_partial_code(search_normalized, codes, matched)
    score = compute_match_score(matched, global_score)
    quality = classify_ocr_quality(
        matched=bool(matched),
        match_type=match_type_api,
        score=score,
        ocr_avg=ocr_avg,
        partial=partial,
        has_codes=bool(codes),
    )

    raw_text = " | ".join(t for t in (ocr_texts or []) if str(t).strip())

    return {
        "raw_ocr_text": raw_text or None,
        "normalized_codes": normalized_codes,
        "matched_code": matched_code,
        "match_score": score,
        "match_type": match_type_api or "none",
        "ocr_quality": quality,
        "partial_code_detected": bool(partial),
        "partial_code_reason": partial_reason,
        "had_ocr_corrections": bool(had_corrections),
    }
