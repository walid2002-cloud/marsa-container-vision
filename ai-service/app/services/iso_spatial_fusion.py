"""
Fusion spatiale des fragments EasyOCR pour reconstruire des codes ISO.

Utilise les bounding boxes pour regrouper les morceaux alignés (même ligne
ou même colonne étroite), concaténer le texte, puis appliquer une regex
``[A-Z]{4}[0-9]{6,7}`` sur la chaîne normalisée — sans relier des zones
éloignées (seuils relatifs à la hauteur médiane des boîtes).
"""

from __future__ import annotations

import logging
import re
from statistics import median
from typing import Any, Dict, List, Optional, Tuple

from app.services.ocr_normalizer import (
    fix_iso_suffix_g_to_six_if_weak_ocr,
    normalize_container_candidate,
    strip_special_and_upper,
)

log = logging.getLogger("marsa.iso_spatial")


def _bounds(poly: List[List[int]]) -> Tuple[float, float, float, float, float, float]:
    xs = [float(p[0]) for p in poly]
    ys = [float(p[1]) for p in poly]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    return x0, y0, x1, y1, x1 - x0, y1 - y0


def _center(poly: List[List[int]]) -> Tuple[float, float]:
    x0, y0, x1, y1, _, _ = _bounds(poly)
    return (x0 + x1) / 2.0, (y0 + y1) / 2.0


def _norm_item(r: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    poly = r.get("bbox")
    if not poly or len(poly) < 4:
        return None
    t = (r.get("text") or "").strip()
    if not t:
        return None
    try:
        x0, y0, x1, y1, w, h = _bounds(poly)
    except (TypeError, ValueError):
        return None
    return {
        "text": t,
        "confidence": float(r.get("confidence") or 0.0),
        "bbox": poly,
        "x0": x0,
        "y0": y0,
        "x1": x1,
        "y1": y1,
        "w": max(w, 1.0),
        "h": max(h, 1.0),
        "cx": (x0 + x1) / 2.0,
        "cy": (y0 + y1) / 2.0,
    }


def _median(vals: List[float], default: float = 1.0) -> float:
    if not vals:
        return default
    return float(median(vals))


def _cluster_lines(items: List[Dict[str, Any]], y_tol_ratio: float = 0.42) -> List[List[Dict[str, Any]]]:
    hs = [it["h"] for it in items]
    mh = _median(hs, 18.0)
    items_sorted = sorted(items, key=lambda z: z["cy"])
    lines: List[List[Dict[str, Any]]] = []
    for it in items_sorted:
        placed = False
        for line in lines:
            ref = line[0]
            if abs(it["cy"] - ref["cy"]) <= y_tol_ratio * max(ref["h"], it["h"], mh):
                line.append(it)
                placed = True
                break
        if not placed:
            lines.append([it])
    for line in lines:
        line.sort(key=lambda z: z["x0"])
    return lines


def _merge_line_chain(line: List[Dict[str, Any]], gap_x_ratio: float = 2.2) -> List[Tuple[str, float, List[str]]]:
    """Retourne liste de (merged_alnum, avg_conf, parts)."""
    if not line:
        return []
    hs = [it["h"] for it in line]
    mh = _median(hs, 18.0)
    chains: List[List[Dict[str, Any]]] = []
    cur = [line[0]]
    for nxt in line[1:]:
        prev = cur[-1]
        gap = nxt["x0"] - prev["x1"]
        max_gap = gap_x_ratio * max(prev["h"], nxt["h"], mh)
        if gap <= max_gap:
            cur.append(nxt)
        else:
            chains.append(cur)
            cur = [nxt]
    chains.append(cur)

    out: List[Tuple[str, float, List[str]]] = []
    for ch in chains:
        parts = [strip_special_and_upper(p["text"]) for p in ch]
        merged_raw = "".join(parts)
        if not merged_raw:
            continue
        confs = [p["confidence"] for p in ch]
        avg_c = sum(confs) / max(len(confs), 1)
        out.append((merged_raw, avg_c, [p["text"] for p in ch]))
    return out


def _cluster_columns(items: List[Dict[str, Any]], x_tol_ratio: float = 0.38) -> List[List[Dict[str, Any]]]:
    ws = [it["w"] for it in items]
    mw = _median(ws, 40.0)
    items_sorted = sorted(items, key=lambda z: z["cx"])
    cols: List[List[Dict[str, Any]]] = []
    for it in items_sorted:
        placed = False
        for col in cols:
            ref = col[0]
            if abs(it["cx"] - ref["cx"]) <= x_tol_ratio * max(ref["w"], it["w"], mw):
                col.append(it)
                placed = True
                break
        if not placed:
            cols.append([it])
    for col in cols:
        col.sort(key=lambda z: z["y0"])
    return cols


def _merge_column_chain(col: List[Dict[str, Any]], gap_y_ratio: float = 2.0) -> List[Tuple[str, float, List[str]]]:
    if not col:
        return []
    hs = [it["h"] for it in col]
    mh = _median(hs, 18.0)
    chains: List[List[Dict[str, Any]]] = []
    cur = [col[0]]
    for nxt in col[1:]:
        prev = cur[-1]
        gap = nxt["y0"] - prev["y1"]
        if gap <= gap_y_ratio * max(prev["h"], nxt["h"], mh):
            cur.append(nxt)
        else:
            chains.append(cur)
            cur = [nxt]
    chains.append(cur)
    out: List[Tuple[str, float, List[str]]] = []
    for ch in chains:
        parts = [strip_special_and_upper(p["text"]) for p in ch]
        merged_raw = "".join(parts)
        if not merged_raw:
            continue
        confs = [p["confidence"] for p in ch]
        avg_c = sum(confs) / max(len(confs), 1)
        out.append((merged_raw, avg_c, [p["text"] for p in ch]))
    return out


def _iso_strings_from_merged(merged_alnum: str, avg_conf: float) -> List[Dict[str, Any]]:
    """Extrait des codes ISO plausibles depuis une chaîne fusionnée."""
    u = merged_alnum.upper()
    u = fix_iso_suffix_g_to_six_if_weak_ocr(u, avg_conf)
    u = normalize_container_candidate(u)
    found: List[Dict[str, Any]] = []
    for m in re.finditer(r"[A-Z]{4}\d{6,7}", u):
        cand = m.group(0)
        if re.fullmatch(r"[A-Z]{4}\d{6,7}", cand):
            found.append(
                {
                    "raw_text": f"~spatial~{cand}",
                    "normalized_code": cand,
                    "pattern_type": "iso_spatial_fused",
                    "confidence_hint": round(avg_conf, 4),
                }
            )
    return found


def build_spatial_iso_candidates(
    ocr_results: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Construit des entrées extractibles depuis les détections OCR + bbox.

    Returns:
        (candidates, debug_dict)
    """
    debug: Dict[str, Any] = {
        "fragments": [],
        "horizontal_merges": [],
        "vertical_merges": [],
        "regex_candidates": [],
    }
    items: List[Dict[str, Any]] = []
    for r in ocr_results or []:
        it = _norm_item(r)
        if it:
            items.append(it)
            debug["fragments"].append({"text": it["text"], "confidence": it["confidence"]})

    if not items:
        return [], debug

    candidates: List[Dict[str, Any]] = []
    seen: set = set()

    def add_all(merges: List[Tuple[str, float, List[str]]], label: str) -> None:
        for merged_raw, avg_c, parts in merges:
            debug[label].append({"parts": parts, "merged_alnum": merged_raw, "avg_conf": round(avg_c, 4)})
            for c in _iso_strings_from_merged(merged_raw, avg_c):
                k = c["normalized_code"]
                if k not in seen:
                    seen.add(k)
                    candidates.append(c)
                    debug["regex_candidates"].append(
                        {"normalized": k, "source": label, "avg_conf": round(avg_c, 4)}
                    )

    for line in _cluster_lines(items):
        add_all(_merge_line_chain(line), "horizontal_merges")

    for col in _cluster_columns(items):
        add_all(_merge_column_chain(col), "vertical_merges")

    log.debug(
        "[ISO_SPATIAL] fragments=%s candidates=%s",
        len(debug["fragments"]),
        [c["normalized_code"] for c in candidates],
    )
    return candidates, debug
