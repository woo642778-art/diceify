from pathlib import Path
from unittest import TestCase
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rd2_extract.normalize import build_tree_costs, normalize_records


class NormalizeTests(TestCase):
    def setUp(self):
        fixture_path = Path(__file__).parent / "fixtures" / "mini_raw_records.json"
        self.records = json.loads(fixture_path.read_text(encoding="utf-8"))
        self.provenance = {
            "schemaVersion": 3,
            "clientVersion": "1.0.1",
            "sourceSha256": "fixture",
            "extractorVersion": "0.1.0",
            "extractedAt": "2026-08-16T00:00:00Z",
        }

    def test_rank_costs_zip_gold_and_stone_only(self):
        self.assertEqual(
            build_tree_costs([2000, 3000], [0, 1], [], 2),
            [
                {"gold": 2000, "stone": 0, "solarCore": 0},
                {"gold": 3000, "stone": 1, "solarCore": 0},
            ],
        )

    def test_predator_fixture_keeps_real_base_fields_partial_until_formula_verified(self):
        normalized = normalize_records(self.records, self.provenance)
        predator = normalized["dice"][0]
        self.assertEqual(predator["id"], "predator")
        self.assertEqual(predator["family"], "chaos")
        self.assertEqual(predator["baseStats"]["attack"], 1000)
        self.assertEqual(predator["baseStats"]["attackInterval"], 2.7)
        interval_growth = next(
            item for item in predator["battleUpgradeGrowth"] if item["stat"] == "attackInterval"
        )
        self.assertEqual(interval_growth["perLevel"], -0.08)
        self.assertEqual(interval_growth["confidence"], "partial")

    def test_tree_uses_client_position_and_rank_cost_arrays(self):
        normalized = normalize_records(self.records, self.provenance)
        node = normalized["tree"][0]
        self.assertEqual(node["position"], {"x": 0.0, "y": -600.0})
        self.assertEqual(node["maxRank"], 2)
        self.assertEqual(
            node["costsByRank"],
            [
                {"gold": 2000, "stone": 0, "solarCore": 0},
                {"gold": 3000, "stone": 1, "solarCore": 0},
            ],
        )


if __name__ == "__main__":
    import unittest
    unittest.main()
