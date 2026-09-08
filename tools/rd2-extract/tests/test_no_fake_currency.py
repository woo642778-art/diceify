from pathlib import Path
from unittest import TestCase
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rd2_extract.normalize import normalize_records


class CurrencyTests(TestCase):
    def test_normalized_tree_never_contains_v2_fake_currency(self):
        fixture_path = Path(__file__).parent / "fixtures" / "mini_raw_records.json"
        records = json.loads(fixture_path.read_text(encoding="utf-8"))
        normalized = normalize_records(
            records,
            {
                "schemaVersion": 3,
                "clientVersion": "1.0.1",
                "sourceSha256": "fixture",
                "extractorVersion": "0.1.0",
                "extractedAt": "2026-08-16T00:00:00Z",
            },
        )
        text = json.dumps(normalized["tree"], sort_keys=True)
        self.assertNotIn("blueCard", text)
        self.assertNotIn("redCard", text)
        self.assertNotIn("prismCube", text)
        for node in normalized["tree"]:
            for cost in node["costsByRank"]:
                self.assertEqual(set(cost), {"gold", "stone", "solarCore"})


if __name__ == "__main__":
    import unittest
    unittest.main()
