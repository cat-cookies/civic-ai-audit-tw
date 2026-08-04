import json
import subprocess
import sys
import unittest
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]

class V4FeatureTest(unittest.TestCase):
    def test_multijurisdiction_portals(self):
        sources=json.loads((ROOT/'data/sources.json').read_text(encoding='utf-8'))
        countries={s.get('country_code') for s in sources}
        self.assertTrue({'TW','US','UK','CA','AU','NZ','JP','KR','SG','EU','INT'}.issubset(countries))
        for source in sources:
            self.assertTrue(source.get('portal_category'))
            parsed=urlparse(source.get('url',''))
            self.assertIn(parsed.scheme, {'http','https'})
            self.assertTrue(parsed.netloc)

    def test_general_curiosity_examples(self):
        examples=json.loads((ROOT/'data/curiosity_examples.json').read_text(encoding='utf-8'))
        labels=' '.join(item['label'] for item in examples)
        self.assertGreaterEqual(len(examples),8)
        self.assertIn('政府今年把錢花在哪裡', labels)
        self.assertIn('房價政策', labels)
        self.assertNotIn('未應門', labels)

    def test_research_methods(self):
        methods=json.loads((ROOT/'data/research_methods.json').read_text(encoding='utf-8'))
        ids={m['id'] for m in methods}
        self.assertTrue({'doctrinal','comparative','causal','implementation','content','budget','safety','survey','mixed'}.issubset(ids))

    def test_virtual_backend(self):
        subprocess.run([sys.executable,'-m','py_compile','backend/hf-space/app.py'],cwd=ROOT,check=True)
        self.assertTrue((ROOT/'backend/hf-space/Dockerfile').exists())
        self.assertTrue((ROOT/'docs/VIRTUAL_LLM_BACKEND.md').exists())

    def test_public_site_contains_v4(self):
        subprocess.run([sys.executable,'scripts/build_site.py'],cwd=ROOT,check=True)
        for name in ['search.js','legislation.js','xlsx-export.js','ai-engine.js','app.js']:
            self.assertTrue((ROOT/'_site'/name).exists())
        self.assertTrue((ROOT/'_site/data/curiosity_examples.json').exists())
        app=(ROOT/'_site/app.js').read_text(encoding='utf-8')
        self.assertIn('下載 Excel', app)
        self.assertIn('資源模式', app)
        self.assertIn('Hugging Face', app)

if __name__=='__main__': unittest.main()
