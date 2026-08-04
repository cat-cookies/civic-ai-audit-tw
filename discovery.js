'use strict';

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivicDiscovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SUBJECT_RULES = [
    ['law', ['法','條文','判決','裁判','憲法','行政法','刑法','民法','違法','司法','訴願','法規']],
    ['health', ['醫療','健康','疾病','病人','個案','照護','照顧','長照','藥物','臨床','護理','公共衛生']],
    ['budget', ['預算','決算','採購','標案','審計','經費','財政','補助']],
    ['statistics', ['統計','資料','數據','指標','趨勢','比例','人口','調查']],
    ['politics', ['政黨','選舉','立委','國會','黨綱','民進黨','國民黨','民眾黨']],
    ['media', ['媒體','新聞','報導','社論','偏向','框架','記者']],
    ['science', ['論文','期刊','研究','實驗','系統性回顧','科技','科學']],
    ['policy', ['政策','改革','制度','治理','執行','行政','主管機關']],
  ];

  function normalize(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  }
  function inferSubject(query) {
    const text = normalize(query);
    let best = {subject:'general', score:0};
    for (const [subject, terms] of SUBJECT_RULES) {
      const score = terms.reduce((sum, term) => sum + (text.includes(normalize(term)) ? 1 : 0), 0);
      if (score > best.score) best = {subject, score};
    }
    return best.subject;
  }
  function validDomain(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/\.$/, '');
    if (!raw || raw.length > 253 || raw.includes('*') || raw.includes(':')) return '';
    if (!/^(?=.{1,253}$)(?:[a-z0-9\u00a1-\uffff](?:[a-z0-9\u00a1-\uffff-]{0,61}[a-z0-9\u00a1-\uffff])?\.)+[a-z\u00a1-\uffff]{2,63}$/.test(raw)) return '';
    return raw;
  }
  function parseDomains(value) {
    return [...new Set(String(value || '').split(/[\s,;\n]+/).map(validDomain).filter(Boolean))].slice(0, 8);
  }
  function backendUrl(runtime, config) {
    return String(config?.backend_url || runtime?.public_api_base_url || '').replace(/\/$/, '');
  }
  function headers(token) {
    return token ? {authorization:`Bearer ${token}`} : {};
  }
  function crossrefItem(item) {
    const title = Array.isArray(item.title) ? item.title[0] : item.title;
    return {
      provider:'Crossref', source_type:'scholarly_metadata', title:title || '未命名文獻',
      url:item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
      snippet:[item['container-title']?.[0], item.DOI ? `DOI: ${item.DOI}` : '', item['is-referenced-by-count'] != null ? `引用中繼資料：${item['is-referenced-by-count']}` : ''].filter(Boolean).join('；'),
      host:item.DOI ? 'doi.org' : '', published_at:String(item.published?.['date-parts']?.[0]?.[0] || item.issued?.['date-parts']?.[0]?.[0] || ''),
      official:false, evidence_status:'中繼資料；須開啟原文', selectable:true
    };
  }
  function epmcItem(item) {
    const id = item.pmcid || item.pmid || item.id;
    return {
      provider:'Europe PMC', source_type:'life_science_literature', title:item.title || '未命名文獻',
      url:item.fullTextUrlList?.fullTextUrl?.[0]?.url || (item.doi ? `https://doi.org/${item.doi}` : id ? `https://europepmc.org/article/${item.source || 'MED'}/${id}` : ''),
      snippet:[item.authorString, item.journalTitle, item.pubYear, item.abstractText ? String(item.abstractText).slice(0,300) : ''].filter(Boolean).join('；'),
      host:item.doi ? 'doi.org' : 'europepmc.org', published_at:String(item.pubYear || ''),
      official:false, evidence_status:item.abstractText ? '含摘要；全文仍須核對' : '中繼資料；須開啟原文', selectable:true
    };
  }
  async function directAcademicSearch(query, subject, maxResults=10) {
    const tasks = [];
    if (['science','policy','law','statistics','general'].includes(subject)) {
      tasks.push(fetch(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=${Math.min(maxResults,10)}&select=DOI,title,author,container-title,published,issued,URL,type,is-referenced-by-count`)
        .then(r=>{if(!r.ok)throw new Error(`Crossref ${r.status}`);return r.json();})
        .then(data=>(data.message?.items||[]).map(crossrefItem)));
    }
    if (subject === 'health') {
      tasks.push(fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${Math.min(maxResults,10)}&resultType=core`)
        .then(r=>{if(!r.ok)throw new Error(`Europe PMC ${r.status}`);return r.json();})
        .then(data=>(data.resultList?.result||[]).map(epmcItem)));
    }
    const settled = await Promise.allSettled(tasks);
    return settled.flatMap(x=>x.status==='fulfilled'?x.value:[]).slice(0,maxResults);
  }
  async function discover({query, subject='auto', jurisdiction='TW', scope='official_professional', customDomains='', freshness='any', maxResults=12, runtime={}, config={}}) {
    const inferred = subject === 'auto' ? inferSubject(query) : subject;
    const url = backendUrl(runtime, config);
    const user_domains = parseDomains(customDomains);
    if (url) {
      const response = await fetch(`${url}/api/discover`, {
        method:'POST',
        headers:{'content-type':'application/json', ...headers(config.backend_token)},
        body:JSON.stringify({q:query, subject:inferred, jurisdiction, scope, user_domains, freshness, max_results:maxResults})
      });
      if (!response.ok) {
        let detail=''; try {detail=(await response.json()).detail||'';} catch {}
        throw new Error(`線上搜尋後端 ${response.status}${detail?`：${detail}`:''}`);
      }
      return response.json();
    }
    const results = await directAcademicSearch(query, inferred, maxResults);
    return {
      query, inferred_subject:inferred, jurisdiction, scope, results,
      provider_status: results.length ? [{provider:'public_academic_api',status:'ok'}] : [{provider:'domain_search_backend',status:'not_configured'}],
      applied_domains:user_domains,
      search_plan: results.length ? [] : ['尚未設定受控搜尋後端；一般政府、法律、政策與媒體網域無法由純 GitHub Pages 安全地即時搜尋。'],
      coverage_notice:'未設定後端時，只直接使用支援跨網域存取的公開學術API；本地索引僅作補充。'
    };
  }
  async function extract({urls, subject, jurisdiction, scope, customDomains='', runtime={}, config={}}) {
    const url = backendUrl(runtime, config);
    if (!url) throw new Error('全文擷取需要受控後端，以執行網域、robots.txt與SSRF檢查。');
    const response = await fetch(`${url}/api/extract`, {
      method:'POST',
      headers:{'content-type':'application/json', ...headers(config.backend_token)},
      body:JSON.stringify({urls, subject, jurisdiction, scope, user_domains:parseDomains(customDomains)})
    });
    if (!response.ok) {
      let detail=''; try {detail=(await response.json()).detail||'';} catch {}
      throw new Error(`全文擷取 ${response.status}${detail?`：${detail}`:''}`);
    }
    return response.json();
  }
  return {inferSubject, validDomain, parseDomains, discover, extract, directAcademicSearch};
});
