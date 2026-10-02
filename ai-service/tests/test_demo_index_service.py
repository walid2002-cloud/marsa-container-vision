"""Index démo hybride (demo_containers.json)."""

import json
import os
import tempfile
import unittest
from pathlib import Path

from app.services import demo_index_service as dis


class TestDemoIndex(unittest.TestCase):
    def setUp(self) -> None:
        root = Path(__file__).resolve().parents[1]
        os.environ["DEMO_CONTAINERS_FILE"] = str(root / "demo_containers.json")
        dis.reload_demo_index()

    def tearDown(self) -> None:
        root = Path(__file__).resolve().parents[1]
        os.environ["DEMO_CONTAINERS_FILE"] = str(root / "demo_containers.json")
        dis.reload_demo_index()

    def test_79943_exact(self):
        h = dis.lookup_demo_index("79943")
        self.assertIsNotNone(h)
        assert h is not None
        self.assertEqual(dis._norm(h.entry["code"]), "79943")
        self.assertEqual(h.match_type, "exact")
        self.assertEqual(h.entry.get("image"), "cam01_quai_nord.png")

    def test_mscu7894563_exact(self):
        h = dis.lookup_demo_index("MSCU7894563")
        self.assertIsNotNone(h)
        assert h is not None
        self.assertEqual(dis._norm(h.entry["code"]), "MSCU7894563")
        self.assertEqual(h.entry.get("image"), "cam02_mscu7894563_rose.png")

    def test_mscu7894563_never_quai_nord(self):
        h = dis.lookup_demo_index("MSCU7894563")
        self.assertIsNotNone(h)
        assert h is not None
        self.assertNotEqual(h.entry.get("image"), "cam01_quai_nord.png")
        self.assertTrue(
            str(h.entry.get("image", "")).startswith("cam02_"),
            "MSCU7894563 doit utiliser une image CAM_02 / MSCU, pas cam01_quai_nord",
        )

    def test_alias_789456_mscu7894563(self):
        h = dis.lookup_demo_index("789456")
        self.assertIsNotNone(h)
        assert h is not None
        self.assertEqual(dis._norm(h.entry["code"]), "MSCU7894563")
        self.assertEqual(h.match_type, "alias")
        self.assertEqual(h.entry.get("image"), "cam02_mscu7894563_rose.png")

    def test_alias_09943(self):
        h = dis.lookup_demo_index("09943")
        self.assertIsNotNone(h)
        assert h is not None
        self.assertEqual(dis._norm(h.entry["code"]), "79943")
        self.assertEqual(h.match_type, "alias")
        self.assertEqual(h.entry.get("image"), "cam01_quai_nord.png")

    def test_no_cross_prefix_fuzzy(self):
        self.assertIsNone(dis.lookup_demo_index("MSCU7132457"))
        self.assertIsNone(dis.lookup_demo_index("CSNU7894563"))

    def test_alias_tghu79943(self):
        h = dis.lookup_demo_index("TGHU79943")
        self.assertIsNotNone(h)
        assert h is not None
        self.assertEqual(dis._norm(h.entry["code"]), "79943")
        self.assertEqual(h.entry.get("image"), "cam01_quai_nord.png")

    def test_unknown_iso(self):
        self.assertIsNone(dis.lookup_demo_index("ZZZZ0000000"))

    def test_priority_exact_over_alias(self):
        h = dis.lookup_demo_index("MSCU789456")
        self.assertIsNotNone(h)
        assert h is not None
        self.assertEqual(dis._norm(h.entry["code"]), "MSCU789456")
        self.assertEqual(h.match_type, "exact")
        self.assertEqual(h.entry.get("image"), "cam02_mscu789456.png")

    def test_temp_index_fuzzy_numeric(self):
        data = [
            {
                "code": "77777",
                "aliases": ["77778"],
                "camera": "CAM_01",
                "zone": "Z",
                "image": "x.png",
                "confidence": 90,
            }
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(data, f)
            path = f.name
        try:
            os.environ["DEMO_CONTAINERS_FILE"] = path
            dis.reload_demo_index()
            h = dis.lookup_demo_index("77779")
            self.assertIsNotNone(h)
            assert h is not None
            self.assertEqual(h.match_type, "fuzzy")
        finally:
            os.unlink(path)


if __name__ == "__main__":
    unittest.main()
