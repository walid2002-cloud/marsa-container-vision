"""
Normalisation de texte issu de l'OCR pour le matching de codes conteneurs.

- Majuscules, suppression espaces / tirets / slash / points (tout non alphanumérique).
- Corrections OCR **uniquement sur la partie numérique** : O→0, I/L/l/|→1
  (pas de S→5, Z→2, etc. sur les chiffres — évite des faux chiffres « corrigés »).
- Ne modifie jamais les 4 lettres du préfixe propriétaire ISO.
"""

from __future__ import annotations

import re
from typing import Tuple

# Corrections minimales, chiffres uniquement (sécurité / précision)
_MINIMAL_DIGIT_OCR = str.maketrans(
    {
        "O": "0",
        "o": "0",
        "I": "1",
        "i": "1",
        "l": "1",
        "L": "1",
        "|": "1",
    }
)

# Corrections OCR étendues (confusions fréquentes lettres ↔ chiffres), appliquées
# UNIQUEMENT sur la partie numérique pour construire des variantes de comparaison
# (fuzzy). Elles n'écrasent jamais le code « normalisé » principal afin de garder
# la précision, mais élargissent le rappel du matching.
_EXTENDED_DIGIT_OCR = str.maketrans(
    {
        "O": "0",
        "o": "0",
        "I": "1",
        "i": "1",
        "l": "1",
        "L": "1",
        "|": "1",
        "Z": "2",
        "z": "2",
        "S": "5",
        "s": "5",
        "B": "8",
        "G": "6",
        "g": "6",
    }
)


def strip_special_and_upper(raw: str) -> str:
    """Supprime espaces, slash, tirets et caractères non alphanumériques ; majuscules."""
    return re.sub(r"[^A-Za-z0-9]", "", (raw or "").strip()).upper()


def _split_iso_style(code: str) -> Tuple[str, str]:
    m = re.match(r"^([A-Z]{4})(\d+)$", code)
    if m:
        return m.group(1), m.group(2)
    return "", code


def apply_ocr_digit_corrections(normalized: str) -> str:
    """
    Applique O→0 et I/L→1 sur la partie numérique uniquement (préfixe 4 lettres intact).
    """
    if not normalized:
        return normalized

    letters, digits = _split_iso_style(normalized)
    if letters:
        return letters + digits.translate(_MINIMAL_DIGIT_OCR)

    if normalized.isdigit():
        return normalized.translate(_MINIMAL_DIGIT_OCR)

    m = re.match(r"^(.+?)(\d+)$", normalized)
    if m:
        prefix, tail = m.group(1), m.group(2)
        return prefix + tail.translate(_MINIMAL_DIGIT_OCR)

    return normalized


def normalize_container_candidate(raw: str) -> str:
    """
    Normalisation « candidat conteneur » après extraction OCR :
    strip + majuscules + corrections O/I/L sur les chiffres uniquement.
    """
    base = strip_special_and_upper(raw)
    if not base:
        return base
    return apply_ocr_digit_corrections(base)


_G_CONF_WEAK = 0.58


def fix_iso_suffix_g_to_six_if_weak_ocr(code_upper: str, avg_ocr_confidence: float) -> str:
    """
    Quand la confiance moyenne des fragments fusionnés est faible, remplace G/g par 6
    dans le suffixe après les 4 lettres (ex. MSCU78945G3 → MSCU7894563).
    Les 4 premières lettres ne sont pas modifiées.
    """
    u = strip_special_and_upper(code_upper)
    if len(u) < 5 or not u[:4].isalpha():
        return u
    letters, tail = u[:4], u[4:]
    if avg_ocr_confidence >= _G_CONF_WEAK:
        return u
    tail2 = "".join("6" if c in "Gg" else c for c in tail)
    return letters + tail2


def apply_extended_ocr_corrections(normalized: str) -> str:
    """
    Corrections OCR étendues (O↔0, I↔1, Z↔2, S↔5, B↔8, G↔6) sur la partie
    numérique uniquement ; les 4 lettres du préfixe ISO restent intactes.
    """
    if not normalized:
        return normalized

    letters, digits = _split_iso_style(normalized)
    if letters:
        return letters + digits.translate(_EXTENDED_DIGIT_OCR)

    if normalized.isdigit():
        return normalized.translate(_EXTENDED_DIGIT_OCR)

    m = re.match(r"^(.+?)(\d+)$", normalized)
    if m:
        prefix, tail = m.group(1), m.group(2)
        return prefix + tail.translate(_EXTENDED_DIGIT_OCR)

    return normalized


def comparison_variants(normalized: str) -> list[tuple[str, str]]:
    """Variantes à comparer : brut, corrigé chiffres minimal, puis corrections étendues."""
    if not normalized:
        return []
    out: list[tuple[str, str]] = [(normalized, "normalized")]
    seen = {normalized}

    corrected = apply_ocr_digit_corrections(normalized)
    if corrected not in seen:
        out.append((corrected, "ocr_digit_corrected"))
        seen.add(corrected)

    extended = apply_extended_ocr_corrections(normalized)
    if extended not in seen:
        out.append((extended, "ocr_extended_corrected"))
        seen.add(extended)

    return out


def normalize_numeric_for_leading_zeros(s: str) -> str:
    if not s or not s.isdigit():
        return s
    t = s.lstrip("0")
    return t if t else "0"
