import unittest
from scripts.validators import publication_findings
class ValidatorTest(unittest.TestCase):
    def test_unreviewed_blocked(self):
        f=publication_findings({'title':'制度問題','evidence_grade':'A','human_reviewed':False,'declared_public':True,'source_type':'official_document'})
        self.assertIn('尚未完成人工覆核',f)
    def test_high_risk_two_approvals(self):
        item={'title':'確定判決認定犯罪','evidence_grade':'A','human_reviewed':True,'declared_public':True,'source_type':'official_document','high_risk':True,'approvals':['a','b']}
        self.assertEqual(publication_findings(item),[])
if __name__=='__main__': unittest.main()
