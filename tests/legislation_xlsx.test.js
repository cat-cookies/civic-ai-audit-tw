'use strict';
const assert = require('assert');
const Legislation = require('../legislation.js');
const XLSX = require('../xlsx-export.js');

const draft = Legislation.buildDrafts({
  law:'示範法', article:'第1條', current_text:'第一條 本法為示範。',
  problem:'現行程序不明確。', goal:'提升程序透明與可預測性。', change:'明定主管機關、期限與救濟。',
  sources:'https://law.moj.gov.tw/'
});
assert.strictEqual(draft.versions.length, 3);
assert.deepStrictEqual(draft.versions.map(v => v.id), ['A','B','C']);
const bytes = XLSX.buildWorkbookBytes(draft);
assert.ok(bytes.length > 2000);
assert.strictEqual(bytes[0], 0x50);
assert.strictEqual(bytes[1], 0x4B);
const text = new TextDecoder().decode(bytes);
assert.ok(text.includes('xl/workbook.xml'));
assert.ok(text.includes('版本比較'));
console.log('legislation and xlsx tests passed');
