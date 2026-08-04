from __future__ import annotations
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class V7FeatureTest(unittest.TestCase):
    def test_prompt_centered_navigation(self):
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        for label in ['問題界定', '概念網絡', '證據與來源', '文獻、學說與方法', '跨國比較', '改革與修法', '反思 Grill-me']:
            self.assertIn(label, html)
        self.assertNotRegex(html, r'<input[^>]+type=["\']file["\']')

    def test_public_url_only_and_no_upload_endpoint(self):
        app = (ROOT / 'app.js').read_text(encoding='utf-8')
        backend = (ROOT / 'backend/hf-space/app.py').read_text(encoding='utf-8')
        self.assertIn('不接受檔案上傳', app)
        self.assertNotIn('/api/upload', backend)
        self.assertIn('extract_docx_text', backend)
        self.assertIn('extract_pptx_text', backend)
        self.assertIn('ocr_image', backend)

    def test_evidence_frameworks_are_question_specific(self):
        data = json.loads((ROOT / 'data/evidence_frameworks.json').read_text(encoding='utf-8'))
        for key in ['intervention', 'harms', 'diagnosis', 'prognosis', 'causal_policy', 'implementation', 'qualitative', 'legal', 'descriptive']:
            self.assertIn(key, data['frameworks'])
        self.assertEqual(len(data['grade']['levels']), 4)
        self.assertEqual(len(data['special']['bradford_hill_viewpoints']), 9)
        self.assertIn('整體證據體', data['grade']['note'])

    def test_ai_contract_requires_apa_and_gaps(self):
        engine = (ROOT / 'ai-engine.js').read_text(encoding='utf-8')
        self.assertIn('apa_references', engine)
        self.assertIn('literature_gap', engine)
        self.assertIn('research_directions', engine)
        for task in ['grill', 'expand', 'network']:
            self.assertIn(task, engine)

    def test_query_expansion_requires_confirmation(self):
        app = (ROOT / 'app.js').read_text(encoding='utf-8')
        self.assertIn('套用選取詞並重新搜尋', app)
        self.assertIn('filter(x=>x.enabled)', app)

    def test_public_build_contains_v7_modules(self):
        # Build is performed by other tests/workflow before this check in CI; build now if absent.
        if not (ROOT / '_site/workflow.js').exists():
            import subprocess, sys
            subprocess.run([sys.executable, 'scripts/build_site.py'], cwd=ROOT, check=True)
        for rel in ['workflow.js', 'network.js', 'data/evidence_frameworks.json']:
            self.assertTrue((ROOT / '_site' / rel).exists(), rel)

if __name__ == '__main__':
    unittest.main()
