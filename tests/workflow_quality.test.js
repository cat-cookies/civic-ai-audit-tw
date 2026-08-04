'use strict';
const assert = require('assert');
const W = require('../workflow.js');

const broad = W.broadness('教育改革', 'policy');
assert.strictEqual(broad.isBroad, true, '過廣提示應先進入 Grill-me');

const precise = W.broadness('比較2021年至2025年臺北市與新北市社會住宅政策是否降低20至39歲青年租金負擔', 'policy');
assert.strictEqual(precise.isBroad, false, '具對象、時間、比較與結果的提示不應被視為過廣');

const questions = W.grillQuestions('教育改革', 'policy');
assert.ok(questions.length >= 4 && questions.length <= 6);
assert.ok(questions.some(x => /政策對象/.test(x.label)));

const refined = W.refinePrompt('教育改革', {scope:'高中學生', mechanism:'課綱', outcome:'學習落差', time:'2022至2026年', decision:'研究計畫'}, 'policy');
assert.ok(refined.includes('高中學生') && refined.includes('學習落差'));

const expansions = W.exactExpansion('個資法與RCT');
assert.ok(expansions.some(x => x.term === '個人資料保護法'));
assert.ok(expansions.some(x => x.term === 'randomized controlled trial'));
assert.ok(!expansions.some(x => /隱私權|資訊安全/.test(x.term)), '不得把相關概念冒充近義詞');

assert.strictEqual(W.inferQuestionType('吸菸是否增加肺癌危害'), 'harms');
assert.strictEqual(W.inferQuestionType('個人資料保護法第19條如何適用'), 'legal');
console.log('workflow quality tests passed');
