'use strict';
const assert = require('assert');
const Search = require('../search.js');
Search.configure(require('../data/concept_ontology.json'));

const corpus = [
  {title:'政府電子採購網', body:'查詢招標、決標、採購公告及廠商資訊。', tags:['政府採購','決標'], official:true},
  {title:'全國法規資料庫', body:'查詢個人資料保護法、勞動基準法等現行法規。', tags:['法規'], official:true},
  {title:'長期照顧政策', body:'長照服務與機構資料。', tags:['長照'], official:true},
  {title:'中央政府總預算', body:'歲入歲出與法定預算。', tags:['預算'], official:true},
];

let results = Search.searchDocuments(corpus, '政府採購 決標');
assert.strictEqual(results[0].title, '政府電子採購網');
assert.ok(results.every(x => x.title !== '長期照顧政策'));

results = Search.searchDocuments(corpus, '個資法');
assert.ok(results.some(x => x.title === '全國法規資料庫'));
assert.ok(Search.explainExpansion('個資法').some(x => x.term === '個人資料保護法'));

results = Search.searchDocuments(corpus, '長期照護');
assert.ok(results.some(x => x.title === '長期照顧政策'), '可將長期照護視為長期照顧的低權重常用語形，但不得擴張為高齡照護或居家服務');


results = Search.searchDocuments(corpus, '政府採購為什麼總是同一家廠商得標');
assert.ok(results.some(x => x.title === '政府電子採購網'));
assert.ok(results.every(x => x.title !== '長期照顧政策'));

results = Search.searchDocuments(corpus, '預算');
assert.strictEqual(results[0].title, '中央政府總預算');
console.log('search quality tests passed');
