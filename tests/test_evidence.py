import unittest
from scripts.evidence import validate_quote
class EvidenceTest(unittest.TestCase):
    def test_exact_quote(self): self.assertTrue(validate_quote('這是一段完整官方原文內容，用於測試。','完整官方原文內容').valid)
    def test_hallucinated_quote(self): self.assertFalse(validate_quote('官方原文沒有這句話','這是一段模型捏造的引文').valid)
if __name__=='__main__': unittest.main()
