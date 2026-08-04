
'use strict';
const assert = require('assert');
const P = require('../political-analysis.js');
const profiles = require('../data/party_ideology_profiles.json').profiles;

const media = P.analyzeMedia({
  headline: '民進黨提出改革方案，國民黨批評程序黑箱',
  body: '民主進步黨表示政策將提升透明度。中國國民黨質疑政府卸責，台灣民眾黨指出應依專業與公開透明原則處理。',
  sources: 'https://a.example\nhttps://b.example', right_of_reply: true, profiles
});
assert.ok(media.partyScores.dpp.mentions > 0);
assert.ok(media.partyScores.kmt.mentions > 0);
assert.ok(media.neutrality >= 0 && media.neutrality <= 100);
assert.ok(media.caveats.length >= 3);

const same = P.compareStatements('支持公開透明與國會監督', '持續支持公開透明，並增加國會監督程序');
assert.ok(['立場大致延續','可能為手段或條件調整'].includes(same.status));
const profile = profiles.find(x => x.party_id === 'tpp');
assert.ok(P.ideologySimilarity('政策應由民意、專業與價值決定，並落實公開透明', profile).score > 0);

const csv='outlet,article_type,published_at,issue,url,headline,body,source_urls,right_of_reply\n媒體,新聞,2026-07-01,能源,https://x,標題,民進黨表示支持改革,https://s,true';
const rows=P.parseCsv(csv);assert.strictEqual(rows.length,1);
const corpus=P.analyzeCorpus(rows,profiles);assert.strictEqual(corpus.items,1);assert.strictEqual(corpus.threshold,false);
console.log('political/media tests passed');
