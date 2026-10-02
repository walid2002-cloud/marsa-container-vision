"""
Validation des codes conteneur (démo numérique + ISO 6346).

- Codes courts numériques (3 à 7 chiffres) pour le mode prototype / démo.
- ISO 6346 : 4 lettres (3ᵉ position souvent U/J/Z) + 6 chiffres série + 1 chiffre de contrôle.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

# 4 lettres + 7 chiffres (inclut check digit)
ISO_FULL_PATTERN = re.compile(r"^[A-Z]{4}\d{7}$")
NUMERIC_DEMO_PATTERN = re.compile(r"^\d{3,7}$")

# Valeurs lettres ISO 6346 (pour calcul du check digit)
_LETTER_VALUES = {
    "A": 10,
    "B": 12,
    "C": 13,
    "D": 14,
    "E": 15,
    "F": 16,
    "G": 17,
    "H": 18,
    "I": 19,
    "J": 20,
    "K": 21,
    "L": 23,
    "M": 24,
    "N": 25,
    "O": 26,
    "P": 27,
    "Q": 28,
    "R": 29,
    "S": 30,
    "T": 31,
    "U": 32,
    "V": 34,
    "W": 35,
    "X": 36,
    "Y": 37,
    "Z": 38,
}


def normalize_input(raw: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", (raw or "").strip()).upper()


def iso6346_compute_check_digit(first_ten: str) -> str:
    """
    Calcule le check digit ISO 6346 pour les 10 premiers caractères
    (4 lettres + 6 chiffres, sans le 11ᵉ).
    """
    if len(first_ten) != 10:
        raise ValueError("Attendu exactement 10 caractères pour le calcul ISO 6346.")

    total = 0
    for i, ch in enumerate(first_ten):
        if ch.isdigit():
            val = int(ch)
        else:
            val = _LETTER_VALUES.get(ch)
            if val is None:
                raise ValueError(f"Caractère invalide pour ISO 6346 : {ch}")
        total += val * (2**i)

    rem = total % 11
    if rem == 10:
        return "0"
    return str(rem)


def iso6346_validate_full(code11: str) -> bool:
    """Vérifie le 11ᵉ caractère (check digit) pour un code normalisé 11 caractères."""
    if len(code11) != 11 or not ISO_FULL_PATTERN.match(code11):
        return False
    body = code11[:10]
    expected = iso6346_compute_check_digit(body)
    return code11[10] == expected


@dataclass
class ValidationResult:
    valid: bool
    normalized: str
    format_type: str  # "numeric_demo" | "iso_6346" | "invalid"
    error_message: Optional[str] = None
    checksum_valid: Optional[bool] = None  # None si non applicable


def validate_container_code(raw: str) -> ValidationResult:
    """
    Valide un code saisi par l'utilisateur.

    Returns:
        ValidationResult avec normalized en majuscules sans séparateurs si valide.
    """
    if not raw or not str(raw).strip():
        return ValidationResult(
            valid=False,
            normalized="",
            format_type="invalid",
            error_message="Le code conteneur est vide.",
        )

    n = normalize_input(raw)

    if NUMERIC_DEMO_PATTERN.match(n):
        return ValidationResult(valid=True, normalized=n, format_type="numeric_demo")

    if ISO_FULL_PATTERN.match(n):
        ck_ok = iso6346_validate_full(n)
        # Les images de démo peuvent porter des codes illustratifs : on n’empêche pas la recherche,
        # mais on expose checksum_valid pour la transparence (logs / API).
        return ValidationResult(
            valid=True,
            normalized=n,
            format_type="iso_6346",
            checksum_valid=ck_ok,
            error_message=None
            if ck_ok
            else (
                f"Avertissement : le check digit ISO 6346 attendu est "
                f"{iso6346_compute_check_digit(n[:10])}, le code saisi se termine par {n[10]} "
                f"(recherche autorisée pour la démo)."
            ),
        )

    # 4 lettres + 6 chiffres uniquement : incomplet
    if re.match(r"^[A-Z]{4}\d{6}$", n):
        return ValidationResult(
            valid=False,
            normalized=n,
            format_type="invalid",
            error_message="Code ISO incomplet : il manque le chiffre de contrôle (11 caractères attendus).",
        )

    return ValidationResult(
        valid=False,
        normalized=n,
        format_type="invalid",
        error_message=(
            "Format de code invalide. Utilisez un code numérique court (3 à 7 chiffres) "
            "ou un code ISO 6346 complet : 4 lettres + 7 chiffres (ex. MSCU1234567)."
        ),
    )
