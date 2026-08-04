'use strict';

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivicSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SYNONYM_GROUPS = [
    ['長期照護','長期照顧','長照'],
    ['居家服務','居家照顧服務','居服'],
    ['高齡照護','老人照顧','老人福利'],
    ['失能照護','失能照顧','身心失能'],
    ['法條','法律條文','條文'],
    ['預算','總預算','決算','財政'],
    ['質詢','詢答','國會監督'],
    ['判決','裁判','裁判書'],
    ['監察','糾正','彈劾','調查報告'],
    ['政黨','黨團','政策主張'],
    ['改革','制度檢討','政策改善'],
    ['採購','政府採購','決標','招標'],
    ['個資','個人資料','隱私'],
    ['住宅','居住','房價','社會住宅'],
    ['勞動','勞工','勞基法','勞動契約'],
  ];

  const TOPICS = [
    {
      id: 'long_term_care',
      aliases: ['長期照護','長期照顧','長照','居家照顧','居家服務','居服','照顧服務','失能照護','高齡照護','老人福利'],
      canonical: '長期照顧',
      suggestions: [
        {
          title: '衛福部長照專區（1966）',
          body: '查長期照顧政策、服務項目、申請資訊、統計、法規及照顧服務資源。',
          url: 'https://1966.gov.tw/LTC/mp-207.html',
          country: '中華民國（臺灣）',
          kind: 'topic_guide'
        },
        {
          title: '衛生福利部長照專區',
          body: '查主管機關政策、公告、法規連結及長期照顧司相關資訊。',
          url: 'https://www.mohw.gov.tw/cp-84-177-1.html',
          country: '中華民國（臺灣）',
          kind: 'topic_guide'
        },
        {
          title: '政府資料開放平臺：搜尋「長照」',
          body: '定位長期照顧機構、服務量、統計與地方政府開放資料集。',
          url: 'https://data.gov.tw/datasets/search?q=%E9%95%B7%E7%85%A7',
          country: '中華民國（臺灣）',
          kind: 'topic_guide'
        },
        {
          title: '立法院議事暨公報：搜尋「長期照顧」',
          body: '追查長期照顧相關提案、委員會、公聽會、協商及院會資料。',
          url: 'https://ppg.ly.gov.tw/ppg/bills/search?criteria=keyword&value=%E9%95%B7%E6%9C%9F%E7%85%A7%E9%A1%A7',
          country: '中華民國（臺灣）',
          kind: 'topic_guide'
        }
      ]
    },
    {
      id: 'labor',
      aliases: ['勞動','勞工','勞基法','工時','勞動契約','最低工資','職災'],
      canonical: '勞動政策',
      suggestions: [
        {title:'勞動部',body:'查勞動政策、法規、統計、公告與業務專區。',url:'https://www.mol.gov.tw/',country:'中華民國（臺灣）',kind:'topic_guide'},
        {title:'全國法規資料庫：勞動法規定位',body:'定位勞動基準法及相關法規的現行條文與沿革。',url:'https://www.google.com/search?q=site%3Alaw.moj.gov.tw+%E5%8B%9E%E5%8B%95',country:'中華民國（臺灣）',kind:'topic_guide'}
      ]
    },
    {
      id: 'housing',
      aliases: ['住宅','居住','房價','租屋','社會住宅','實價登錄','土地政策'],
      canonical: '住宅政策',
      suggestions: [
        {title:'內政部不動產資訊平台',body:'查住宅、房價、租屋與不動產市場統計。',url:'https://pip.moi.gov.tw/',country:'中華民國（臺灣）',kind:'topic_guide'},
        {title:'實價登錄',body:'查不動產成交與租賃實價資訊。',url:'https://lvr.land.moi.gov.tw/',country:'中華民國（臺灣）',kind:'topic_guide'}
      ]
    },
    {
      id: 'budget',
      aliases: ['預算','總預算','決算','財政','歲出','歲入','審計'],
      canonical: '預算與審計',
      suggestions: [
        {title:'中央政府總預算查詢服務',body:'查總預算案、法定預算及機關預算表件。',url:'https://dq.dgbas.gov.tw/SBA_BS/',country:'中華民國（臺灣）',kind:'topic_guide'},
        {title:'審計部',body:'查中央及地方政府決算審核與審計報告。',url:'https://www.audit.gov.tw/',country:'中華民國（臺灣）',kind:'topic_guide'}
      ]
    },
    {
      id: 'health',
      aliases: ['醫療','健康','公共衛生','健保','醫事','疾病防治'],
      canonical: '醫療與公共衛生',
      suggestions: [
        {title:'衛生福利部',body:'查醫療、公共衛生、社會福利與相關政策法規。',url:'https://www.mohw.gov.tw/',country:'中華民國（臺灣）',kind:'topic_guide'},
        {title:'中央健康保險署',body:'查健保政策、支付制度、醫療服務與統計。',url:'https://www.nhi.gov.tw/',country:'中華民國（臺灣）',kind:'topic_guide'}
      ]
    }
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

  function matchedTopics(query) {
    const qc = compact(query);
    if (!qc) return [];
    return TOPICS.filter(topic =>
      topic.aliases.some(alias => qc.includes(compact(alias)) || compact(alias).includes(qc))
    );
  }

  function synonymVariants(query) {
    const q = normalize(query);
    const qc = compact(q);
    const variants = [{term:q, weight:1, type:'原始詞'}];

    for (const group of SYNONYM_GROUPS) {
      const normalized = group.map(normalize);
      const compacted = normalized.map(compact);
      if (compacted.some(term => qc.includes(term) || term.includes(qc))) {
        normalized.forEach(term => variants.push({term, weight:0.92, type:'近義詞'}));
      }
    }

    // 議題層級關聯採較低權重，只能進入「相關」層，不會冒充直接同義詞。
    for (const topic of matchedTopics(q)) {
      topic.aliases.map(normalize).forEach(term => {
        if (compact(term) !== qc) variants.push({term, weight:0.55, type:'議題相關詞'});
      });
    }

    const dedup = new Map();
    for (const item of variants) {
      const key = compact(item.term);
      if (!key) continue;
      if (!dedup.has(key) || dedup.get(key).weight < item.weight) dedup.set(key, item);
    }
    return [...dedup.values()];
  }

  function bigrams(value) {
    const s = compact(value);
    const set = new Set();
    if (s.length < 2) {
      if (s) set.add(s);
      return set;
    }
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  }

  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    for (const item of a) if (b.has(item)) intersection += 1;
    return intersection / (a.size + b.size - intersection);
  }

  function scoreDocument(doc, query) {
    const q = normalize(query);
    const qc = compact(q);
    if (!qc) return {...doc, score:0, tier:'none', match_reason:'未輸入查詢詞'};

    const title = normalize(doc.title || '');
    const titleC = compact(title);
    const tags = normalize((doc.tags || []).join(' '));
    const tagsC = compact(tags);
    const body = normalize(doc.body || '');
    const bodyC = compact(body);
    const searchable = normalize(doc.searchable || `${title} ${tags} ${body}`);
    const variants = synonymVariants(q);

    let lexical = 0;
    let strongest = 0;
    const reasons = [];
    let directHit = false;

    if (titleC === qc) {
      lexical += 150;
      strongest = Math.max(strongest, 150);
      reasons.push('標題完全相同');
      directHit = true;
    } else if (titleC.includes(qc)) {
      lexical += 95;
      strongest = Math.max(strongest, 95);
      reasons.push('標題直接包含查詢詞');
      directHit = true;
    }

    if (tagsC.includes(qc)) {
      lexical += 65;
      strongest = Math.max(strongest, 65);
      reasons.push('分類或標籤直接命中');
      directHit = true;
    }

    if (bodyC.includes(qc)) {
      lexical += 45;
      strongest = Math.max(strongest, 45);
      reasons.push('內容直接包含查詢詞');
      directHit = true;
    }

    for (const variant of variants) {
      const vc = compact(variant.term);
      if (!vc || vc === qc) continue;
      if (titleC.includes(vc)) {
        lexical += 58 * variant.weight;
        strongest = Math.max(strongest, 58 * variant.weight);
        reasons.push(`標題命中${variant.type}「${variant.term}」`);
      } else if (tagsC.includes(vc)) {
        lexical += 38 * variant.weight;
        strongest = Math.max(strongest, 38 * variant.weight);
        reasons.push(`標籤命中${variant.type}「${variant.term}」`);
      } else if (bodyC.includes(vc)) {
        lexical += 24 * variant.weight;
        strongest = Math.max(strongest, 24 * variant.weight);
        reasons.push(`內容命中${variant.type}「${variant.term}」`);
      }
    }

    const originalTokens = normalize(query).split(' ').filter(x => x.length >= 2 || /\d/.test(x));
    if (originalTokens.length > 1) {
      const matched = originalTokens.filter(t => searchable.includes(t));
      const coverage = matched.length / originalTokens.length;
      if (coverage === 1) {
        lexical += 55;
        strongest = Math.max(strongest, 55);
        reasons.push('全部關鍵字均命中');
        directHit = true;
      } else if (coverage >= 0.67) {
        lexical += 28 * coverage;
        strongest = Math.max(strongest, 18);
        reasons.push(`命中 ${matched.length}/${originalTokens.length} 個關鍵字`);
      }
    }

    if (strongest >= 18) {
      lexical += jaccard(bigrams(q), bigrams(`${title} ${tags}`)) * 18;
    }

    // 相關性硬門檻：官方來源不能單靠身分進榜。
    if (strongest < 18 || lexical < 20) {
      return {...doc, score:0, tier:'none', match_reason:'沒有實質詞彙命中'};
    }

    let authority = 0;
    if (doc.official) authority += 2.5;
    if (doc.human_reviewed) authority += 2;
    if (doc.evidence_grade === 'A') authority += 1.5;

    const score = Math.round((lexical + authority) * 10) / 10;
    const tier = directHit || strongest >= 45 ? 'direct' : 'related';
    return {
      ...doc,
      score,
      tier,
      match_reason: unique(reasons).slice(0, 3).join('；') || '相關詞彙命中'
    };
  }

  function searchDocuments(documents, query, limit = 12) {
    return (documents || [])
      .map(doc => scoreDocument(doc, query))
      .filter(doc => doc.score > 0)
      .sort((a, b) => {
        const tierOrder = {direct:0, related:1};
        return (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9)
          || b.score - a.score
          || String(a.title).localeCompare(String(b.title), 'zh-Hant');
      })
      .slice(0, limit);
  }

  function topicSuggestions(query) {
    const out = [];
    for (const topic of matchedTopics(query)) {
      for (const item of topic.suggestions) {
        out.push({
          id: `topic:${topic.id}:${out.length}`,
          official: true,
          score: 999,
          tier: 'guide',
          match_reason: `議題直達：${topic.canonical}`,
          tags: [topic.canonical, '官方議題入口'],
          ...item
        });
      }
    }
    return out;
  }

  function genericOfficialSuggestions(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const encoded = encodeURIComponent(q);
    return [
      {
        id:'generic:law',
        kind:'topic_guide',
        title:`全國法規資料庫：定位「${q}」`,
        body:'搜尋現行法規、沿革、公布與施行資訊；搜尋結果仍須核對官方條文。',
        url:`https://www.google.com/search?q=${encodeURIComponent(`site:law.moj.gov.tw ${q}`)}`,
        country:'中華民國（臺灣）',
        official:true,
        tier:'guide',
        match_reason:'無直接索引結果時的官方定位入口',
        tags:['法規','官方議題入口']
      },
      {
        id:'generic:ppg',
        kind:'topic_guide',
        title:`立法院議事暨公報：搜尋「${q}」`,
        body:'搜尋相關提案、委員會、公聽會、協商與院會資料。',
        url:`https://ppg.ly.gov.tw/ppg/bills/search?criteria=keyword&value=${encoded}`,
        country:'中華民國（臺灣）',
        official:true,
        tier:'guide',
        match_reason:'無直接索引結果時的官方定位入口',
        tags:['立法','官方議題入口']
      },
      {
        id:'generic:data',
        kind:'topic_guide',
        title:`政府資料開放平臺：搜尋「${q}」`,
        body:'搜尋可下載資料集、統計欄位與機關資料。',
        url:`https://data.gov.tw/datasets/search?q=${encoded}`,
        country:'中華民國（臺灣）',
        official:true,
        tier:'guide',
        match_reason:'無直接索引結果時的官方定位入口',
        tags:['開放資料','官方議題入口']
      }
    ];
  }

  return {
    normalize,
    compact,
    synonymVariants,
    scoreDocument,
    searchDocuments,
    topicSuggestions,
    genericOfficialSuggestions
  };
});
