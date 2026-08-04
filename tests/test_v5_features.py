from __future__ import annotations
import json, subprocess, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class V5Test(unittest.TestCase):
    def test_literature_and_theory_links(self):
        literature=json.loads((ROOT/'data/literature_catalog.json').read_text(encoding='utf-8'))
        theories=json.loads((ROOT/'data/theory_catalog.json').read_text(encoding='utf-8'))
        ids={x['id'] for x in literature}
        self.assertGreaterEqual(len(literature),25)
        self.assertGreaterEqual(len(theories),15)
        for item in literature:
            self.assertTrue(item.get('doi'))
            self.assertTrue(item.get('title'))
            self.assertTrue(item.get('authors'))
        for theory in theories:
            self.assertTrue(theory.get('proposition'))
            self.assertTrue(theory.get('mechanisms'))
            self.assertTrue(theory.get('diagnostic_questions'))
            self.assertTrue(set(theory.get('literature_ids',[])).issubset(ids))
    def test_public_build_v5(self):
        subprocess.run([sys.executable,'scripts/build_search_index.py'],cwd=ROOT,check=True)
        subprocess.run([sys.executable,'scripts/build_site.py'],cwd=ROOT,check=True)
        subprocess.run([sys.executable,'scripts/check_site.py'],cwd=ROOT,check=True)
        for name in ['academic.js','data/literature_catalog.json','data/concept_ontology.json']:
            self.assertTrue((ROOT/'_site'/name).exists())
        index=(ROOT/'_site/index.html').read_text(encoding='utf-8')
        self.assertIn('文獻、學說與方法',index)
    def test_backend_compile(self):
        subprocess.run([sys.executable,'-m','py_compile','backend/hf-space/app.py'],cwd=ROOT,check=True)
        text=(ROOT/'backend/hf-space/app.py').read_text(encoding='utf-8')
        self.assertIn('/api/literature',text)
        self.assertRegex(text, r'version=["\']7\.[0-9]+\.[0-9]+["\']')
if __name__=='__main__': unittest.main()
