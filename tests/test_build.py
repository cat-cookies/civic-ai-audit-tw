import json, subprocess, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class BuildTest(unittest.TestCase):
    def test_search_index(self):
        subprocess.check_call([sys.executable,str(ROOT/'scripts/build_search_index.py')])
        data=json.loads((ROOT/'data/search-index.json').read_text(encoding='utf-8'))
        self.assertGreaterEqual(data['document_count'],60)
        self.assertTrue(data['documents_sha256'])
    def test_public_allowlist(self):
        subprocess.check_call([sys.executable,str(ROOT/'scripts/build_site.py')])
        subprocess.check_call([sys.executable,str(ROOT/'scripts/check_site.py')])
        self.assertFalse((ROOT/'_site/config/models.json').exists())
        self.assertFalse((ROOT/'_site/review').exists())
        self.assertTrue((ROOT/'_site/.nojekyll').exists())
if __name__=='__main__': unittest.main()
