"""Fusion spatiale OCR → code ISO complet depuis fragments."""

import unittest

from app.services.code_extractor import extract_container_codes
from app.services.iso_spatial_fusion import build_spatial_iso_candidates


def _box(x0: int, y0: int, w: int, h: int):
    return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]


class TestIsoSpatialFusion(unittest.TestCase):
    def test_build_from_three_horizontal_fragments(self):
        """MSCU + 789456 + 3 alignés → MSCU7894563."""
        ocr = [
            {"text": "MSCU", "confidence": 0.7, "bbox": _box(10, 50, 44, 22)},
            {"text": "789456", "confidence": 0.65, "bbox": _box(58, 48, 72, 24)},
            {"text": "3", "confidence": 0.6, "bbox": _box(136, 50, 14, 20)},
        ]
        cands, dbg = build_spatial_iso_candidates(ocr)
        norms = [c["normalized_code"] for c in cands]
        self.assertIn("MSCU7894563", norms)
        self.assertTrue(any(m.get("parts") for m in dbg.get("horizontal_merges", [])))

    def test_extract_merges_fragments_not_phantom_across_unrelated_lines(self):
        """Sans bbox alignée, deux lignes OCR ne forment pas MSCU7894563."""
        texts = ["MSCU", "7894563"]
        ocr = [
            {"text": "MSCU", "confidence": 0.9, "bbox": _box(0, 0, 40, 20)},
            {"text": "7894563", "confidence": 0.9, "bbox": _box(400, 400, 80, 20)},
        ]
        found = extract_container_codes(texts, ocr)
        norms = [e["normalized_code"] for e in found]
        self.assertNotIn("MSCU7894563", norms)

    def test_extract_with_close_horizontal_boxes(self):
        texts = ["MSCU", "789456", "3"]
        ocr = [
            {"text": "MSCU", "confidence": 0.55, "bbox": _box(20, 100, 48, 26)},
            {"text": "789456", "confidence": 0.52, "bbox": _box(75, 98, 88, 28)},
            {"text": "3", "confidence": 0.5, "bbox": _box(170, 100, 16, 24)},
        ]
        found = extract_container_codes(texts, ocr)
        norms = [e["normalized_code"] for e in found]
        self.assertIn("MSCU7894563", norms)
        iso_spatial = [e for e in found if e.get("pattern_type") == "iso_spatial_fused"]
        self.assertTrue(iso_spatial)


if __name__ == "__main__":
    unittest.main()
