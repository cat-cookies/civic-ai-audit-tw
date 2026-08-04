'use strict';
const assert = require('assert');
const D = require('../discovery.js');

assert.strictEqual(D.inferSubject('個人資料保護法第19條'), 'law');
assert.strictEqual(D.inferSubject('心衰竭居家照護成效'), 'health');
assert.strictEqual(D.inferSubject('中央政府總預算執行率'), 'budget');
assert.strictEqual(D.validDomain('https://law.moj.gov.tw/LawClass/LawAll.aspx'), 'law.moj.gov.tw');
assert.strictEqual(D.validDomain('127.0.0.1'), '');
assert.strictEqual(D.validDomain('*.gov.tw'), '');
assert.deepStrictEqual(D.parseDomains('law.moj.gov.tw, ppg.ly.gov.tw\nlaw.moj.gov.tw'), ['law.moj.gov.tw','ppg.ly.gov.tw']);

console.log('domain discovery tests passed');
