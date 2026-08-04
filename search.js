'use strict';

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivicSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  // Only controlled abbreviations and formal naming variants are expanded automatically.
  // Broad topic associations are deliberately excluded because they distort relevance.
  const CONTROLLED_EQUIVALENTS = [
    ['長照', '長期照顧'],
    ['勞基法', '勞動基準法'],
    ['個資法', '個人資料保護法'],
    ['健保', '全民健康保險'],
    ['社宅', '社會住宅'],
    ['國會', '立法院'],
    ['判決', '裁判書'],
    ['法條', '法律條文'],
    ['政府採購', '招標', '決標'],
    ['總預算', '中央政府總預算'],
  ];

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[，。；：、！？「」『』（）()【】\[\]〈〉《》“”"'`~!@#$%^&*+=|\\/:;,.?<>_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compact(value) {
    return normalize(value).replace(/\s+/g, '');
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function segment(value) {
    const text = normalize(value);
    const tokens = text.split(' ').filter(Boolean);
    if (tokens.length > 1) return unique(tokens);
    const c = compact(text);
    const out = [];
    if (c) out.push(c);
    if (c.length >= 4) {
      for (let i = 0; i < c.length - 1; i += 1) out.push(c.slice(i, i + 2));
    }
    return unique(out);
  }

  function controlledVariants(query) {
    const q = compact(query);
    const variants = [{ term: q, weight: 1, reason: '原始查詢詞' }];
    for (const pair of CONTROLLED_EQUIVALENTS) {
      const p = pair.map(compact);
      if (p.some(term => q === term || q.includes(term) || term.includes(q))) {
        p.forEach(term => variants.push({ term, weight: 0.72, reason: '受控名稱變體' }));
      }
    }
    const map = new Map();
    for (const item of variants) {
      if (!item.term) continue;
      if (!map.has(item.term) || map.get(item.term).weight < item.weight) map.set(item.term, item);
    }
    return [...map.values()];
  }

  function fieldText(doc, field) {
    if (field === 'title') return normalize(doc.title || '');
    if (field === 'tags') return normalize((doc.tags || []).join(' '));
    if (field === 'body') return normalize(doc.body || '');
    return normalize(doc.searchable || `${doc.title || ''} ${(doc.tags || []).join(' ')} ${doc.body || ''}`);
  }

  function documentFrequency(documents, term) {
    const t = compact(term);
    return documents.reduce((count, doc) => count + (compact(fieldText(doc, 'all')).includes(t) ? 1 : 0), 0);
  }

  function idf(total, df) {
    return Math.log(1 + (total - df + 0.5) / (df + 0.5));
  }

  function countOccurrences(text, term) {
    const source = compact(text);
    const target = compact(term);
    if (!source || !target) return 0;
    let count = 0;
    let pos = 0;
    while ((pos = source.indexOf(target, pos)) !== -1) {
      count += 1;
      pos += Math.max(1, target.length);
    }
    return count;
  }

  function scoreDocument(doc, query, corpus) {
    const raw = normalize(query);
    const q = compact(raw);
    if (!q) return { ...doc, score: 0, tier: 'none', match_reason: '未輸入查詢詞' };

    const title = fieldText(doc, 'title');
    const tags = fieldText(doc, 'tags');
    const body = fieldText(doc, 'body');
    const all = fieldText(doc, 'all');
    const variants = controlledVariants(q);
    const originalTokens = normalize(query).split(' ').filter(t => compact(t).length >= 2);
    const reasons = [];
    let score = 0;
    let strongest = 0;
    let direct = false;

    for (const variant of variants) {
      const term = variant.term;
      const df = documentFrequency(corpus, term);
      const rarity = idf(Math.max(1, corpus.length), df);
      const titleHits = countOccurrences(title, term);
      const tagHits = countOccurrences(tags, term);
      const bodyHits = countOccurrences(body, term);
      const weighted = variant.weight * rarity * (titleHits * 11 + tagHits * 7 + Math.min(bodyHits, 3) * 2.5);
      score += weighted;
      strongest = Math.max(strongest, weighted);

      if (compact(title) === term && variant.weight === 1) {
        score += 40;
        strongest = Math.max(strongest, 40);
        direct = true;
        reasons.push('標題完全符合');
      } else if (compact(title).includes(term)) {
        score += 18 * variant.weight;
        strongest = Math.max(strongest, 18 * variant.weight);
        if (variant.weight === 1) direct = true;
        reasons.push(variant.weight === 1 ? '標題直接命中' : '標題命中受控名稱變體');
      } else if (variant.weight < 1 && compact(tags).includes(term)) {
        score += 7 * variant.weight;
        strongest = Math.max(strongest, 7 * variant.weight);
        reasons.push('標籤命中受控名稱變體');
      } else if (variant.weight < 1 && compact(body).includes(term)) {
        score += 5 * variant.weight;
        strongest = Math.max(strongest, 5 * variant.weight);
        reasons.push('內容命中受控名稱變體');
      }
    }

    if (originalTokens.length > 1) {
      const matched = originalTokens.filter(token => all.includes(normalize(token)));
      const coverage = matched.length / originalTokens.length;
      if (coverage === 1) {
        score += 18;
        strongest = Math.max(strongest, 18);
        direct = true;
        reasons.push('全部關鍵字均命中');
      } else if (coverage >= 0.6) {
        score += 8 * coverage;
        reasons.push(`命中 ${matched.length}/${originalTokens.length} 個關鍵字`);
      }
    }

    // Hard relevance gate. Authority can never rescue a document without lexical evidence.
    if (strongest < 3.2 || score < 4.5) {
      return { ...doc, score: 0, tier: 'none', match_reason: '沒有足夠詞彙證據' };
    }

    let authority = 0;
    if (doc.official) authority += 0.8;
    if (doc.human_reviewed) authority += 0.6;
    if (doc.evidence_grade === 'A') authority += 0.4;
    score += authority;

    return {
      ...doc,
      score: Math.round(score * 10) / 10,
      tier: direct ? 'direct' : 'related',
      match_reason: unique(reasons).slice(0, 3).join('；') || '詞彙相關',
    };
  }

  function searchDocuments(documents, query, limit = 15) {
    const corpus = documents || [];
    return corpus
      .map(doc => scoreDocument(doc, query, corpus))
      .filter(doc => doc.score > 0)
      .sort((a, b) => {
        const order = { direct: 0, related: 1 };
        return (order[a.tier] ?? 9) - (order[b.tier] ?? 9)
          || b.score - a.score
          || String(a.title).localeCompare(String(b.title), 'zh-Hant');
      })
      .slice(0, limit);
  }

  function explainExpansion(query) {
    return controlledVariants(query)
      .filter(item => item.weight < 1)
      .map(item => ({ term: item.term, reason: item.reason, weight: item.weight }));
  }

  return {
    normalize,
    compact,
    segment,
    controlledVariants,
    explainExpansion,
    scoreDocument,
    searchDocuments,
  };
});
