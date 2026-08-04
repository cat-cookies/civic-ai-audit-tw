from __future__ import annotations
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class DomainDiscoveryFeatureTest(unittest.TestCase):
    def test_policy_structure(self):
        data=json.loads((ROOT/'config/domain_policy.json').read_text(encoding='utf-8'))
        self.assertIn('TW',data['jurisdictions'])
        self.assertIn('law',data['subjects'])
        self.assertGreaterEqual(len(data['jurisdictions']['TW']['official_domains']),10)

    def test_build_files(self):
        self.assertTrue((ROOT/'discovery.js').exists())
        self.assertTrue((ROOT/'backend/hf-space/domain_policy.json').exists())

    def test_no_ip_identity_routing(self):
        data=json.loads((ROOT/'config/domain_policy.json').read_text(encoding='utf-8'))
        self.assertTrue(any('不使用IP' in x or 'IP' in x for x in data['principles']))

if __name__=='__main__':
    unittest.main()
