"""Extraction codes : pas de fusion fantôme entre lignes OCR."""

import unittest

from app.services.code_extractor import extract_container_codes


class TestPerLineExtraction(unittest.TestCase):
    def test_no_phantom_iso_across_lines(self):
        """Évite MSCU + ligne suivante 7894563 → faux MSCU7894563."""
        texts = ["MSCU", "7894563", "CSNU7132457"]
        found = extract_container_codes(texts)
        norms = [e["normalized_code"] for e in found]
        self.assertNotIn("MSCU7894563", norms)
        self.assertIn("CSNU7132457", norms)

    def test_same_line_still_extracts_iso(self):
        texts = ["Zone A MSCU7894563 fin"]
        found = extract_container_codes(texts)
        norms = [e["normalized_code"] for e in found]
        self.assertIn("MSCU7894563", norms)

    def test_spaced_iso_on_one_line_compact_regex(self):
        texts = ["MSCU 789456 3"]
        found = extract_container_codes(texts)
        norms = [e["normalized_code"] for e in found]
        self.assertIn("MSCU7894563", norms)
        entry = next(e for e in found if e["normalized_code"] == "MSCU7894563")
        self.assertIn(entry["pattern_type"], ("iso_regex_compact_line", "iso_6346", "alpha_numeric"))


if __name__ == "__main__":
    unittest.main()
