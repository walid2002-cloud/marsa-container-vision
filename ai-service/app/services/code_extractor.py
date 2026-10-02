"""
Extracteur d'identifiants de conteneurs depuis du texte OCR.

Ce module analyse le texte brut retourné par l'OCR pour en extraire
les codes de conteneurs. Il utilise des expressions régulières basées
sur les formats standards d'identification de conteneurs.

Formats reconnus :
  - ISO 6346 : 4 lettres + 7 chiffres (ex: MSCU1234567, MRSK-123456-7)
  - Numérique court : 3-7 chiffres consécutifs (ex: 79943, 1234567)
  - Fusion spatiale (bbox) : fragments EasyOCR sur une même ligne/colonne
    → chaîne ``[A-Z]{4}[0-9]{6,7}`` sans concaténer des lignes OCR arbitraires.

État : FONCTIONNEL
  - Extraction par regex **par ligne OCR** (pas de concaténation globale des lignes),
    afin d'éviter les faux codes ISO formés entre deux lignes (ex. fin « MSCU »
    + début « 7894563 » sur une autre ligne sans lien spatial).
  - Si ``ocr_results`` (texte + bbox + confiance) est fourni, candidats ISO
    additionnels via ``build_spatial_iso_candidates`` (alignement horizontal/vertical).
"""

import logging
import re
from typing import Any, Dict, List, Optional

from app.services.iso_spatial_fusion import build_spatial_iso_candidates
from app.services.ocr_normalizer import normalize_container_candidate, strip_special_and_upper

log = logging.getLogger("marsa.code_extractor")

# Format ISO 6346 complet : 4 lettres + 7 chiffres
# Avec séparateurs optionnels (espace, tiret, point)
ISO_6346_PATTERN = re.compile(
    r'[A-Z]{3}[UJZ][\s\-\.]*\d[\s\-\.]*\d[\s\-\.]*\d[\s\-\.]*\d[\s\-\.]*\d[\s\-\.]*\d[\s\-\.]*\d',
    re.IGNORECASE
)

# Format plus souple : 4 lettres + 6-7 chiffres
ALPHA_NUM_PATTERN = re.compile(
    r'[A-Z]{4}[\s\-\.]*\d{6,7}',
    re.IGNORECASE
)

# Numérique court : 3 à 7 chiffres (démo + prototypes)
NUMERIC_PATTERN = re.compile(
    r'(?<![A-Za-z0-9])\d{3,7}(?![A-Za-z0-9])'
)

ISO_COMPACT_REGEX = re.compile(r"[A-Z]{4}\d{6,7}")


def normalize_code(raw: str) -> str:
    """Nettoie un texte : lettres/chiffres uniquement, majuscules (aligné avec ocr_normalizer)."""
    return strip_special_and_upper(raw)


def _extract_iso_regex_compact_line(segment: str, found: List[dict], seen: set) -> None:
    """Après suppression des séparateurs : ``MSCU 789456 3`` → MSCU7894563 + regex."""
    compact = strip_special_and_upper(segment)
    if len(compact) < 10:
        return
    for m in ISO_COMPACT_REGEX.finditer(compact):
        raw = m.group(0)
        code = normalize_container_candidate(raw)
        if not code or code in seen:
            continue
        if not re.fullmatch(r"[A-Z]{4}\d{6,7}", code):
            continue
        seen.add(code)
        found.append({
            "raw_text": raw,
            "normalized_code": code,
            "pattern_type": "iso_regex_compact_line",
        })


def _extract_from_segment(segment: str, found: List[dict], seen: set) -> None:
    """Applique les regex sur un seul segment (une ligne OCR)."""
    if not (segment or "").strip():
        return

    for match in ISO_6346_PATTERN.finditer(segment):
        code = normalize_container_candidate(match.group())
        if code not in seen:
            seen.add(code)
            found.append({
                "raw_text": match.group().strip(),
                "normalized_code": code,
                "pattern_type": "iso_6346",
            })

    for match in ALPHA_NUM_PATTERN.finditer(segment):
        code = normalize_container_candidate(match.group())
        if code not in seen:
            seen.add(code)
            found.append({
                "raw_text": match.group().strip(),
                "normalized_code": code,
                "pattern_type": "alpha_numeric",
            })

    for match in NUMERIC_PATTERN.finditer(segment):
        code = normalize_container_candidate(match.group())
        if code not in seen:
            seen.add(code)
            found.append({
                "raw_text": code,
                "normalized_code": code,
                "pattern_type": "numeric",
            })

    _extract_iso_regex_compact_line(segment, found, seen)


def extract_container_codes(
    ocr_texts: List[str],
    ocr_results: Optional[List[Dict[str, Any]]] = None,
    *,
    iso_debug: Optional[Dict[str, Any]] = None,
) -> List[dict]:
    """
    Extrait les codes de conteneurs possibles depuis une liste de textes OCR.

    Analyse **chaque ligne de texte isolément** pour les regex classiques, ce qui
    évite les correspondances fantômes du type ``MSCU`` en fin de ligne + ``7894563``
    au début de la ligne suivante sans bbox commune.

    Si ``ocr_results`` est fourni, ajoute des candidats ``iso_spatial_fused`` issus
    de la fusion spatiale des boîtes OCR (même ligne / même colonne proche).

    Args:
        ocr_texts: Textes bruts (lignes ou un item par détection).
        ocr_results: Optionnel — liste ``{text, confidence, bbox}`` pour fusion ISO.
        iso_debug: Si dict fourni, y est écrit le debug fusion (fragments, merges, regex).

    Returns:
        Liste de dicts: {raw_text, normalized_code, pattern_type}
    """
    found: List[dict] = []
    seen: set = set()

    for line in ocr_texts:
        _extract_from_segment(line, found, seen)

    if ocr_results:
        spatial, dbg = build_spatial_iso_candidates(ocr_results)
        if iso_debug is not None:
            iso_debug.clear()
            iso_debug.update(dbg)
        for c in spatial:
            k = c["normalized_code"]
            if k not in seen:
                seen.add(k)
                found.append(c)
        log.debug(
            "[ISO_EXTRACT] spatial_candidates=%s regex_hits=%s",
            [x.get("normalized_code") for x in spatial],
            dbg.get("regex_candidates"),
        )
    elif iso_debug is not None:
        iso_debug.clear()

    log.debug(
        "[ISO_EXTRACT] ocr_lines=%s merged_codes=%s",
        ocr_texts,
        [e["normalized_code"] for e in found],
    )

    return found


def match_code(
    extracted_codes: List[dict],
    search_code: str,
    scan_context: Optional[str] = None,
) -> dict | None:
    """
    Cherche une correspondance entre les codes extraits et un code recherché.

    Logique : ISO 6346 complet (11 car.) impose le même préfixe 4 lettres et un fuzzy
    strict sur les chiffres ; codes numériques courts : fuzzy plus souple, sous-chaîne
    numérique uniquement si longueurs proches.

    Champs additionnels sur le dict retourné (outre raw_text, normalized_code, pattern_type) :
      - match_type : exact_match | substring_match | fuzzy_match
      - similarity_score : float 0–1
      - exact_match : bool
      - fuzzy_match : bool
      - match_detail : str (résumé pour logs / debug)

    scan_context : identifiant libre pour les logs (ex. nom de fichier image).
    """
    from app.services.fuzzy_match_service import find_best_container_match

    return find_best_container_match(extracted_codes, search_code, scan_context=scan_context)
