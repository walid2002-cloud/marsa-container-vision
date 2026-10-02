"""Tests unitaires du matching conteneur (ISO vs numérique court)."""

import unittest

from app.services.fuzzy_match_service import (
    classify_search_code,
    find_best_container_match,
)


def _code(raw: str, norm: str, pattern: str = "iso_6346") -> dict:
    return {"raw_text": raw, "normalized_code": norm, "pattern_type": pattern}


class TestIsoPrefixGate(unittest.TestCase):
    def test_mscu_never_matches_csnu(self):
        extracted = [_code("CSNU713245", "CSNU713245")]
        self.assertIsNone(find_best_container_match(extracted, "MSCU7894563"))

    def test_mscu_never_matches_hlxu(self):
        extracted = [_code("HLXU4501234", "HLXU4501234")]
        self.assertIsNone(find_best_container_match(extracted, "MSCU7894563"))

    def test_iso_same_prefix_close_digits_fuzzy(self):
        extracted = [_code("MSCU7894567", "MSCU7894567")]
        m = find_best_container_match(extracted, "MSCU7894563")
        self.assertIsNotNone(m)
        self.assertEqual(m["normalized_code"], "MSCU7894567")
        self.assertTrue(m.get("fuzzy_match") or m.get("exact_match"))

    def test_iso_same_prefix_far_digits_rejected(self):
        extracted = [_code("MSCU1234567", "MSCU1234567")]
        self.assertIsNone(find_best_container_match(extracted, "MSCU7894563"))

    def test_iso_request_never_matches_digits_only_candidate(self):
        extracted = [_code("789456", "789456", "numeric")]
        self.assertIsNone(find_best_container_match(extracted, "MSCU7894563"))

    def test_mscu7894563_can_match_mscu789456(self):
        extracted = [_code("MSCU789456", "MSCU789456", "alpha_numeric")]
        m = find_best_container_match(extracted, "MSCU7894563")
        self.assertIsNotNone(m)
        self.assertEqual(m.get("matched_candidate"), "MSCU789456")


class TestNumericShort(unittest.TestCase):
    def test_79943_matches_09943(self):
        extracted = [_code("09943", "09943", "numeric")]
        m = find_best_container_match(extracted, "79943")
        self.assertIsNotNone(m)

    def test_numeric_does_not_pick_iso_candidate(self):
        extracted = [_code("MSCU7894563", "MSCU7894563")]
        self.assertIsNone(find_best_container_match(extracted, "79943"))

    def test_numeric_substring_rejects_long_embedding(self):
        extracted = [_code("123479943", "123479943", "numeric")]
        self.assertIsNone(find_best_container_match(extracted, "79943"))

    def test_79943_does_not_match_713245(self):
        extracted = [_code("713245", "713245", "numeric")]
        self.assertIsNone(find_best_container_match(extracted, "79943"))


class TestClassify(unittest.TestCase):
    def test_kinds(self):
        self.assertEqual(classify_search_code("MSCU7894563"), "ISO_CODE")
        self.assertEqual(classify_search_code("MSCU789456"), "ISO_CODE")
        self.assertEqual(classify_search_code("79943"), "NUMERIC_SHORT")


if __name__ == "__main__":
    unittest.main()
