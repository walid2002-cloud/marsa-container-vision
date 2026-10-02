"""
Matching conteneurs : ISO (4 lettres + chiffres) vs codes numériques courts.

Sécurité :
  - Recherche ISO_CODE : uniquement candidats avec le même préfixe 4 lettres ;
    jamais de match sur un code purement numérique ; jamais HLXU vs MSCU.
  - Fuzzy ISO : Levenshtein sur la partie chiffres (plafond 1 ou 2 selon longueur)
    + similarité globale >= 0,85.
  - NUMERIC_SHORT : uniquement candidats numériques ; Lev <= 1 ; longueurs proches ;
    similarité >= 0,80.
"""

from __future__ import annotations

import logging
import os
import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from app.services.ocr_normalizer import (
    comparison_variants,
    normalize_numeric_for_leading_zeros,
    strip_special_and_upper,
)

log = logging.getLogger("marsa.fuzzy_match")

ISO_CODE = re.compile(r"^[A-Z]{4}\d+$")
NUM_SHORT = re.compile(r"^\d{3,7}$")

ISO_FUZZY_MIN_SIM = float(os.getenv("ISO_FUZZY_MIN_SIM", "0.85"))
NUM_FUZZY_MIN_SIM = float(os.getenv("NUM_FUZZY_MIN_SIM", "0.80"))


def _iso_extraction_bonus(code_info: dict) -> float:
    """Petit bonus si le candidat vient d'une reconstruction ISO fiable (ne relâche pas les gates)."""
    pt = (code_info.get("pattern_type") or "").strip().lower()
    if pt == "iso_spatial_fused":
        return 0.06
    if pt in ("iso_6346", "iso_regex_compact_line"):
        return 0.04
    return 0.0

LAST_MATCH_DEBUG: Dict[str, Any] = {}


def get_last_match_debug() -> Dict[str, Any]:
    return dict(LAST_MATCH_DEBUG)


def _set_last_debug(**kwargs: Any) -> None:
    LAST_MATCH_DEBUG.clear()
    LAST_MATCH_DEBUG.update(kwargs)


def classify_search_code(normalized: str) -> str:
    """NUMERIC_SHORT | ISO_CODE | other (alias public pour tests)."""
    u = strip_special_and_upper(normalized)
    if NUM_SHORT.match(u):
        return "NUMERIC_SHORT"
    if ISO_CODE.match(u):
        return "ISO_CODE"
    return "other"


def split_owner_digits(code: str) -> Optional[Tuple[str, str]]:
    c = strip_special_and_upper(code)
    m = re.match(r"^([A-Z]{4})(\d+)$", c)
    if not m:
        return None
    return m.group(1).upper(), m.group(2)


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    la, lb = len(a), len(b)
    row = list(range(lb + 1))
    for i in range(1, la + 1):
        prev = row[0]
        row[0] = i
        for j in range(1, lb + 1):
            cur = row[j]
            cost = 0 if a[i - 1] == b[j - 1] else 1
            row[j] = min(row[j] + 1, row[j - 1] + 1, prev + cost)
            prev = cur
    return row[lb]


def similarity_score(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    sm = SequenceMatcher(None, a, b).ratio()
    d = levenshtein(a, b)
    mx = max(len(a), len(b), 1)
    lev_sim = 1.0 - (d / mx)
    return max(sm, lev_sim)


def _max_digit_lev_iso(td: str, cd: str) -> int:
    """Plafond Levenshtein chiffres : 2 si une des séquences a longueur >= 7, sinon 1."""
    mx = max(len(td), len(cd), 1)
    return 2 if mx >= 7 else 1


def _target_variants(search_normalized: str) -> List[Tuple[str, str]]:
    base = strip_special_and_upper(search_normalized)
    out = comparison_variants(base)
    seen = set()
    uniq: List[Tuple[str, str]] = []
    for s, label in out:
        if s not in seen:
            seen.add(s)
            uniq.append((s, f"search:{label}"))
    if not uniq and base:
        uniq.append((base, "search:raw"))
    return uniq


def _candidate_strings(code_info: Dict[str, Any]) -> List[Tuple[str, str]]:
    n = code_info.get("normalized_code") or ""
    return [(s, f"candidate:{lab}") for s, lab in comparison_variants(strip_special_and_upper(n))]


def _numeric_bonus(a: str, b: str) -> float:
    if a.isdigit() and b.isdigit():
        if normalize_numeric_for_leading_zeros(a) == normalize_numeric_for_leading_zeros(b):
            return 0.03
    return 0.0


def _pair_allowed(
    target_kind: str,
    target_base: str,
    cand: str,
) -> Tuple[bool, str]:
    cand_clean = strip_special_and_upper(cand)
    t_parts = split_owner_digits(target_base)
    c_parts = split_owner_digits(cand_clean)

    if target_kind == "ISO_CODE":
        if not t_parts:
            return False, "target_not_iso_format"
        tp, _td = t_parts
        if cand_clean.isdigit():
            return False, "digits_only_forbidden_for_iso_search"
        if not c_parts:
            return False, "candidate_not_4letters_plus_digits"
        cp, _cd = c_parts
        if cp != tp:
            return False, f"prefix_mismatch:{cp}!={tp}"
        return True, ""

    if target_kind == "NUMERIC_SHORT":
        if not target_base.isdigit():
            return False, "target_not_numeric"
        if not cand_clean.isdigit():
            return False, "iso_forbidden_for_numeric_search"
        return True, ""

    if t_parts and c_parts and t_parts[0] != c_parts[0]:
        return False, "prefix_mismatch_other"
    return True, ""


def _flatten_pairs(extracted_codes: List[dict]) -> List[Tuple[Dict[str, Any], str, str]]:
    out: List[Tuple[Dict[str, Any], str, str]] = []
    for code_info in extracted_codes:
        for cand, c_lab in _candidate_strings(code_info):
            out.append((code_info, cand, c_lab))
    return out


def _api_match_type(internal: str) -> str:
    return {
        "exact_match": "exact",
        "fuzzy_match": "fuzzy",
    }.get(internal, "none")


def _reject_append(
    bucket: List[Dict[str, str]],
    cand: str,
    reason: str,
    seen: set,
) -> None:
    key = (cand, reason)
    if key in seen:
        return
    seen.add(key)
    bucket.append({"candidate": cand, "reason": reason})


def find_best_container_match(
    extracted_codes: List[dict],
    search_code: str,
    scan_context: Optional[str] = None,
) -> Optional[dict]:
    """
    Retourne le dict d'extraction enrichi ou None.
    Champs supplémentaires possibles sur le dict retourné :
      matched_candidate, rejected_candidates (liste {candidate, reason})
    """
    rejected: List[Dict[str, str]] = []
    rej_seen: set = set()

    target_base = strip_special_and_upper(search_code) if search_code else ""
    _set_last_debug(
        scan_context=scan_context,
        requested=target_base,
        reason="init",
        rejected_candidates=[],
    )

    if not extracted_codes or not (search_code or "").strip():
        _set_last_debug(reason="empty_input", scan_context=scan_context, rejected_candidates=rejected)
        return None

    target_kind = classify_search_code(target_base)
    target_variants = _target_variants(target_base)

    log.info(
        "[MATCH][start] img=%s requested=%r kind=%s ocr_candidates=%s",
        scan_context,
        target_base,
        target_kind,
        [e.get("normalized_code") for e in extracted_codes],
    )

    pairs = _flatten_pairs(extracted_codes)
    gated: List[Tuple[Dict[str, Any], str, str]] = []
    for code_info, cand, c_lab in pairs:
        ok, gate_reason = _pair_allowed(target_kind, target_base, cand)
        if ok:
            gated.append((code_info, cand, c_lab))
        else:
            _reject_append(rejected, cand, gate_reason, rej_seen)
            log.debug(
                "[MATCH][reject_gate] img=%s target=%r cand=%r raw=%r reason=%s",
                scan_context,
                target_base,
                cand,
                code_info.get("raw_text"),
                gate_reason,
            )

    if not gated:
        _set_last_debug(
            reason="no_valid_candidate_after_prefix_or_type_gate",
            target_kind=target_kind,
            target=target_base,
            scan_context=scan_context,
            extracted=[e.get("normalized_code") for e in extracted_codes],
            rejected_candidates=rejected,
        )
        log.warning(
            "[MATCH][reject] aucun candidat valide | img=%s target=%r kind=%s | rejects=%s",
            scan_context,
            target_base,
            target_kind,
            rejected,
        )
        return None

    # --- Exact ---
    for code_info, cand, c_lab in gated:
        for tv, t_lab in target_variants:
            if cand == tv:
                merged = {
                    **code_info,
                    "exact_match": True,
                    "fuzzy_match": False,
                    "similarity_score": 1.0,
                    "match_type": "exact_match",
                    "match_detail": f"{c_lab} == {t_lab}",
                    "matched_candidate": cand,
                    "rejected_candidates": list(rejected),
                }
                log.info(
                    "[MATCH][accept][exact] img=%s target=%r cand=%r raw_ocr=%r",
                    scan_context,
                    tv,
                    cand,
                    code_info.get("raw_text"),
                )
                return merged

    # --- Fuzzy : meilleur score parmi gated uniquement ---
    best: Optional[Dict[str, Any]] = None
    best_score = -1.0
    best_d = 10**9
    best_meta: Dict[str, Any] = {}

    for code_info, cand, c_lab in gated:
        for tv, t_lab in target_variants:
            d_full = levenshtein(cand, tv)
            d_digits = d_full
            mx_len = max(len(cand), len(tv), 1)

            if target_kind == "ISO_CODE":
                tparts = split_owner_digits(tv)
                cparts = split_owner_digits(cand)
                if not tparts or not cparts:
                    continue
                _tp, td = tparts
                _cp, cd = cparts
                d_digits = levenshtein(td, cd)
                max_dlev = _max_digit_lev_iso(td, cd)
                if d_digits > max_dlev:
                    _reject_append(
                        rejected,
                        cand,
                        f"digit_levenshtein_{d_digits}>{max_dlev}",
                        rej_seen,
                    )
                    log.debug(
                        "[MATCH][skip_fuzzy] digit_lev=%s>%s tv=%r cand=%r",
                        d_digits,
                        max_dlev,
                        tv,
                        cand,
                    )
                    continue
                sc = similarity_score(cand, tv) + _iso_extraction_bonus(code_info)
                sc = min(1.0, sc)
                if sc < ISO_FUZZY_MIN_SIM:
                    _reject_append(rejected, cand, f"similarity_{sc:.2f}<{ISO_FUZZY_MIN_SIM}", rej_seen)
                    continue
                short_ok = False
            elif target_kind == "NUMERIC_SHORT":
                if abs(len(cand) - len(tv)) > 1:
                    _reject_append(rejected, cand, "length_diff_gt_1", rej_seen)
                    continue
                if d_full > 1:
                    _reject_append(rejected, cand, f"lev_{d_full}>1", rej_seen)
                    continue
                sc = similarity_score(cand, tv) + _numeric_bonus(cand, tv)
                sc = min(1.0, sc)
                if sc < NUM_FUZZY_MIN_SIM:
                    _reject_append(rejected, cand, f"similarity_{sc:.2f}<{NUM_FUZZY_MIN_SIM}", rej_seen)
                    continue
                d_digits = d_full
                short_ok = True
            else:
                d_digits = d_full
                short_ok = mx_len <= 7 and d_full <= 2
                sc = similarity_score(cand, tv)
                if sc < NUM_FUZZY_MIN_SIM and not (short_ok and d_full <= 1 and sc >= 0.72):
                    _reject_append(rejected, cand, "other_kind_threshold", rej_seen)
                    continue

            better = sc > best_score or (sc == best_score and d_full < best_d)
            if better:
                best_score = sc
                best_d = d_full
                best = code_info
                best_meta = {
                    "cand": cand,
                    "c_lab": c_lab,
                    "tv": tv,
                    "t_lab": t_lab,
                    "_d": d_full,
                    "_d_digits": d_digits if target_kind == "ISO_CODE" else d_full,
                    "short_ok": short_ok,
                }

    if best is None:
        _set_last_debug(
            reason="no_fuzzy_passed_thresholds",
            target_kind=target_kind,
            target=target_base,
            scan_context=scan_context,
            rejected_candidates=rejected,
        )
        log.warning(
            "[MATCH][reject][fuzzy] img=%s target=%r kind=%s | gated=%s rejects=%s",
            scan_context,
            target_base,
            target_kind,
            [(g[1], g[0].get("raw_text")) for g in gated],
            rejected,
        )
        return None

    cand = best_meta["cand"]
    tv = best_meta["tv"]
    d_full = best_meta["_d"]
    d_digits = best_meta.get("_d_digits", d_full)

    if target_kind == "ISO_CODE":
        tparts = split_owner_digits(tv)
        cparts = split_owner_digits(cand)
        td = tparts[1] if tparts else ""
        cd = cparts[1] if cparts else ""
        max_dlev = _max_digit_lev_iso(td, cd)
        accept = best_score >= ISO_FUZZY_MIN_SIM and d_digits <= max_dlev
        reason = f"iso_sim>={ISO_FUZZY_MIN_SIM} digit_lev<={max_dlev}"
    elif target_kind == "NUMERIC_SHORT":
        accept = best_score >= NUM_FUZZY_MIN_SIM and d_full <= 1 and abs(len(cand) - len(tv)) <= 1
        reason = "numeric_lev1_sim080"
    else:
        accept = best_score >= NUM_FUZZY_MIN_SIM or (
            best_meta["short_ok"] and best_score >= 0.72 and d_full <= 1
        )
        reason = "other_fallback"

    log.info(
        "[MATCH][fuzzy_eval] img=%s target=%r cand=%r score=%.3f lev=%s digit_lev=%s accept=%s (%s)",
        scan_context,
        tv,
        cand,
        best_score,
        d_full,
        d_digits,
        accept,
        reason,
    )

    if not accept:
        _reject_append(rejected, cand, "final_threshold_not_met", rej_seen)
        _set_last_debug(
            reason="fuzzy_final_reject",
            target=target_base,
            best_cand=cand,
            best_score=best_score,
            digit_lev=d_digits,
            scan_context=scan_context,
            rejected_candidates=rejected,
        )
        return None

    return {
        **best,
        "exact_match": False,
        "fuzzy_match": True,
        "similarity_score": round(best_score, 4),
        "match_type": "fuzzy_match",
        "match_detail": f"{best_meta['c_lab']} vs {best_meta['t_lab']} score={best_score:.3f} lev={d_full} digit_lev={d_digits}",
        "matched_candidate": cand,
        "rejected_candidates": list(rejected),
    }


def map_internal_match_type_to_api(internal: Optional[str]) -> str:
    if not internal:
        return "none"
    return _api_match_type(internal)
