import unittest
from scripts.data_policy import classify
class DataPolicyTest(unittest.TestCase):
    def test_public_official(self): self.assertTrue(classify('公開法規文字','official_document',True).external_model_allowed)
    def test_phone_blocked(self): self.assertFalse(classify('聯絡電話 0912-345-678','official_document',True).external_model_allowed)
    def test_unknown_blocked(self): self.assertFalse(classify('內部草案').external_model_allowed)
if __name__=='__main__': unittest.main()
