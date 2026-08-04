'use strict';
const assert = require('assert');
const Search = require('../search.js');

const unrelatedOfficial = {
  title: '中央政府總預算查詢服務',
  body: '行政院主計總處預算、採購與財政資料。',
  tags: ['預算','財政'],
  official: true
};
const relevant = {
  title: '長期照顧服務政策',
  body: '提供居家服務、失能照顧及長照統計。',
  tags: ['長照','社會福利'],
  official: true
};
const related = {
  title: '高齡照護與居家服務',
  body: '老人福利與照顧服務制度。',
  tags: ['高齡照護'],
  official: false
};

assert.strictEqual(Search.scoreDocument(unrelatedOfficial, '長期照護').score, 0);
assert.ok(Search.scoreDocument(relevant, '長期照護').score > 0);
assert.ok(Search.scoreDocument(related, '長期照護').score > 0);

const ranked = Search.searchDocuments([unrelatedOfficial, relevant, related], '長期照護');
assert.ok(ranked.length >= 1);
assert.ok(ranked.every(x => x.title !== unrelatedOfficial.title));

const guides = Search.topicSuggestions('長期照護');
assert.ok(guides.some(x => /1966/.test(x.title)));
assert.ok(guides.every(x => x.tier === 'guide'));

const noMatch = Search.searchDocuments([unrelatedOfficial], '長期照護');
assert.strictEqual(noMatch.length, 0);

console.log('search quality tests passed');
