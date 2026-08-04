from __future__ import annotations
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class PoliticalMediaFeatureTest(unittest.TestCase):
    def test_new_public_data(self):
        for name in [
            "party_source_registry.json","party_ideology_profiles.json","media_methodology.json",
            "media_ownership_registry.json","comparative_applicability.json"
        ]:
            self.assertTrue((ROOT/"data"/name).exists())

    def test_party_sources(self):
        data=json.loads((ROOT/"data/party_source_registry.json").read_text(encoding="utf-8"))
        self.assertEqual(len(data["parties"]),3)
        self.assertTrue(all(len(p["channels"])>=3 for p in data["parties"]))

    def test_media_rule(self):
        data=json.loads((ROOT/"data/media_methodology.json").read_text(encoding="utf-8"))
        self.assertIn("不是", data["ownership_rule"])
        self.assertGreaterEqual(data["outlet_level_requirements"]["minimum_articles"],30)

    def test_public_templates(self):
        import subprocess, sys
        subprocess.run([sys.executable, "scripts/build_site.py"], cwd=ROOT, check=True)
        self.assertTrue((ROOT/"_site/examples/party_social_import_template.csv").exists())
        self.assertTrue((ROOT/"_site/examples/media_corpus_template.csv").exists())

    def test_comparative_applicability(self):
        data=json.loads((ROOT/"data/comparative_applicability.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(data["records"]),8)
        self.assertTrue(all(r.get("citation") and r.get("roc_applicability") for r in data["records"]))

if __name__=="__main__":
    unittest.main()
