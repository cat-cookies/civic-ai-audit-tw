import json
import unittest
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]

class V3FeatureTest(unittest.TestCase):
    def test_multijurisdiction_portals(self):
        sources=json.loads((ROOT/'data/sources.json').read_text(encoding='utf-8'))
        countries={s.get('country_code') for s in sources}
        self.assertTrue({'TW','US','UK','CA','AU','NZ','JP','KR','SG','EU','INT'}.issubset(countries))
        for s in sources:
            self.assertTrue(s.get('portal_category'))
            u=urlparse(s.get('url',''))
            self.assertIn(u.scheme, {'http','https'})
            self.assertTrue(u.netloc)

    def test_research_method_engine_data(self):
        methods=json.loads((ROOT/'data/research_methods.json').read_text(encoding='utf-8'))
        ids={m['id'] for m in methods}
        self.assertTrue({'doctrinal','comparative','causal','implementation','content','budget','safety','survey'}.issubset(ids))

    def test_no_repository_placeholder(self):
        runtime=json.loads((ROOT/'config/runtime.json').read_text(encoding='utf-8'))
        self.assertNotIn('OWNER', runtime.get('repository_url',''))
        self.assertIn('cat-cookies/civic-ai-audit-tw', runtime.get('repository_url',''))

    def test_public_site_contains_new_data(self):
        import subprocess, sys
        subprocess.run([sys.executable,'scripts/build_site.py'],cwd=ROOT,check=True)
        self.assertTrue((ROOT/'_site/data/jurisdictions.json').exists())
        self.assertTrue((ROOT/'_site/data/research_methods.json').exists())
        app=(ROOT/'_site/app.js').read_text(encoding='utf-8')
        self.assertIn('discoverModels', app)
        self.assertIn('methodRecommendation', app)
        self.assertIn('OpenRouter', app)
        self.assertTrue((ROOT/'_site/search.js').exists())

if __name__=='__main__': unittest.main()
