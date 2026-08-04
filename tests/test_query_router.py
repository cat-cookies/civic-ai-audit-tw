import unittest
from scripts.query_router import detect_query_route, chinese_number_to_int

class QueryRouterTest(unittest.TestCase):
    def test_exact_arabic(self):
        r=detect_query_route('老人福利法第48條')
        self.assertEqual(r.mode,'exact_law'); self.assertEqual(r.law_name,'老人福利法'); self.assertEqual(r.article_number,48)
    def test_exact_chinese(self):
        r=detect_query_route('長期照顧服務法第三十八條')
        self.assertEqual(r.mode,'exact_law'); self.assertEqual(r.article_number,38)
    def test_subarticle(self):
        r=detect_query_route('行政程序法第123之1條')
        self.assertEqual((r.article_number,r.subarticle_number),(123,1))
    def test_ambiguous_article(self):
        self.assertEqual(detect_query_route('第48條').mode,'law_article_ambiguous')
    def test_fuzzy(self):
        self.assertEqual(detect_query_route('居家服務未應門').mode,'fuzzy')
    def test_number(self):
        self.assertEqual(chinese_number_to_int('一百零二'),102)
        self.assertEqual(chinese_number_to_int('兩百三十'),230)

if __name__=='__main__': unittest.main()
