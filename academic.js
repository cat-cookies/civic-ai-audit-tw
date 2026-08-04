'use strict';
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivicAcademic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function normalize(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase()
      .replace(/[，。；：、！？「」『』（）()【】\[\]〈〉《》“”"'`~!@#$%^&*+=|\\/:;,.?<>_-]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function compact(value) { return normalize(value).replace(/\s+/g, ''); }
  function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
  const ACADEMIC_TERMS = [
    '議程設定','政策窗口','多元流程','倡議聯盟','否決者','有限理性','漸進主義',
    '責任政治','政治問責','審議民主','公共參與','政策網絡','協力治理',
    '街頭官僚','行政裁量','執行落差','政策執行','實施科學','組織變遷',
    '高可靠度組織','系統安全','人因工程','事故分析','風險治理',
    '政策回饋','路徑依賴','制度變遷','政策移植','法規影響評估',
    '比例原則','法律保留','法律明確性','權利保障','分配正義',
    '因果推論','差異中的差異','合成控制','準實驗','時間序列','內容分析',
    '系統性回顧','統合分析','質性研究','混合方法','問卷調查','個案研究',
    '預算','房價','社會住宅','電價','能源','少子化','長期照顧','醫療','教育',
    '勞動','交通','採購','個人資料','政黨','法律','法規','裁判','執行','問責','參與','比較','成效','影響'
  ];
  function meaningfulTokens(value) {
    const text = normalize(value);
    const textCompact = compact(text);
    const stop = new Set(['什麼','為什麼','怎麼','如何','是否','有沒有','哪個','哪些','可以','需要','目前','相關','問題','政策','制度','資料','研究']);
    const parts = text.split(' ').filter(Boolean);
    const recognised = ACADEMIC_TERMS.filter(term => textCompact.includes(compact(term)));
    const ordinary = parts.filter(x => compact(x).length >= 2 && !stop.has(x));
    if(recognised.length || ordinary.length > 1) return unique([...recognised,...ordinary]);
    if(ordinary.length === 1 && ordinary[0].length <= 12) return ordinary;
    // 長句無法斷詞時不直接以整句要求完全命中，避免推薦全部失敗。
    return recognised;
  }
  function countHit(text, term) {
    const a = compact(text), b = compact(term);
    if (!a || !b) return 0;
    let n = 0, pos = 0;
    while ((pos = a.indexOf(b, pos)) >= 0) { n += 1; pos += Math.max(1, b.length); }
    return n;
  }
  function searchLiterature(records, query, options = {}) {
    const q = normalize(query); const tokens = meaningfulTokens(q); const domain = options.domain || '';
    return (records || []).map(item => {
      if (domain && !(item.domains || []).includes(domain)) return {...item, score:0};
      const title = item.title || ''; const meta = `${(item.authors||[]).join(' ')} ${item.journal||''} ${item.year||''} ${(item.keywords||[]).join(' ')} ${(item.domains||[]).join(' ')} ${item.use||''}`;
      let score = 0; const reasons = [];
      if (compact(title).includes(compact(q)) && compact(q).length >= 3) { score += 70; reasons.push('題名直接命中'); }
      const matched = tokens.filter(t => compact(`${title} ${meta}`).includes(compact(t)));
      if (tokens.length) {
        const coverage = matched.length / tokens.length;
        score += coverage * 36;
        if (matched.length) reasons.push(`命中 ${matched.length}/${tokens.length} 個研究詞`);
      }
      for (const term of tokens) {
        score += Math.min(2, countHit(title, term)) * 8;
        score += Math.min(2, countHit((item.keywords||[]).join(' '), term)) * 6;
        score += Math.min(2, countHit((item.domains||[]).join(' '), term)) * 4;
      }
      if (item.peer_reviewed) score += 0.5;
      return {...item, score:Math.round(score*10)/10, match_reason:reasons.join('；')};
    }).filter(x => x.score >= (options.minScore || 6)).sort((a,b)=>b.score-a.score || b.year-a.year).slice(0, options.limit || 20);
  }
  function recommendTheories(theories, query, limit = 5) {
    const tokens = meaningfulTokens(query);
    return (theories || []).map(theory => {
      const fields = `${theory.name} ${theory.category} ${(theory.keywords||[]).join(' ')} ${theory.proposition||''} ${(theory.diagnostic_questions||[]).join(' ')}`;
      let score = 0; const matched = [];
      for (const token of tokens) {
        if (compact(theory.name).includes(compact(token))) { score += 12; matched.push(token); }
        else if (compact((theory.keywords||[]).join(' ')).includes(compact(token))) { score += 8; matched.push(token); }
        else if (compact(fields).includes(compact(token))) { score += 3; matched.push(token); }
      }
      return {...theory, score, match_reason:unique(matched).join('、')};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
  }
  function recommendMethods(methods, query, limit = 3) {
    const q = normalize(query);
    return (methods || []).map(method => {
      const hits = (method.triggers || []).filter(t => q.includes(normalize(t)));
      return {...method, score:hits.length*5, match_reason:hits.join('、')};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
  }
  function doiUrl(doi) { return doi ? `https://doi.org/${String(doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'')}` : ''; }
  function apa(item) {
    const authors = (item.authors || []).join(', ') || '作者未提供';
    const year = item.year || 'n.d.';
    const venue = item.journal ? ` ${item.journal}.` : '';
    const doi = item.doi ? ` ${doiUrl(item.doi)}` : '';
    return `${authors} (${year}). ${item.title}.${venue}${doi}`;
  }
  function ris(records) {
    return (records || []).map(item => [
      `TY  - ${item.type === 'journal_article' ? 'JOUR' : 'CPAPER'}`,
      ...(item.authors || []).map(author => `AU  - ${author}`),
      `PY  - ${item.year || ''}`,
      `TI  - ${item.title || ''}`,
      `JO  - ${item.journal || ''}`,
      item.doi ? `DO  - ${item.doi}` : '',
      item.url ? `UR  - ${item.url}` : '',
      'ER  - '
    ].filter(Boolean).join('\n')).join('\n\n');
  }
  function bibtex(records) {
    return (records || []).map(item => {
      const type = item.type === 'journal_article' ? 'article' : 'inproceedings';
      return `@${type}{${item.citation_key || item.id},\n  title={${item.title || ''}},\n  author={${(item.authors||[]).join(' and ')}},\n  year={${item.year || ''}},\n  ${type==='article'?'journal':'booktitle'}={${item.journal || ''}},\n  doi={${item.doi || ''}},\n  url={${item.url || doiUrl(item.doi)}}\n}`;
    }).join('\n\n');
  }
  function downloadText(filename, content, type='text/plain;charset=utf-8') {
    if (typeof document === 'undefined') return content;
    const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    return content;
  }
  function buildEvidencePacket({question, documents, theories, literature, methods, queryPlan}) {
    const sourceRecords = (documents || []).slice(0,10).map((item,index)=>({
      source_id:item.id || `SRC-${index+1}`, title:item.title||'', url:item.url||'',
      source_type:item.kind||'', official:Boolean(item.official), date:item.date||item.updated_at||'',
      excerpt:String(item.body||'').slice(0,1000), limitation:item.limitations||'', match_reason:item.match_reason||''
    }));
    const theoryRecords = (theories || []).slice(0,6).map(item=>({theory_id:item.id,name:item.name,proposition:item.proposition,limitations:item.limitations,literature_ids:item.literature_ids||[]}));
    const litRecords = (literature || []).slice(0,10).map(item=>({literature_id:item.id,title:item.title,authors:item.authors,year:item.year,journal:item.journal,doi:item.doi,use:item.use,limitation:item.limitation}));
    const methodRecords = (methods || []).slice(0,4).map(item=>({method_id:item.id,name:item.name,why:item.why,caveat:item.caveat,literature_ids:item.literature_ids||[]}));
    return {schema_version:'5.0', question, query_plan:queryPlan||{}, sources:sourceRecords, theories:theoryRecords, literature:litRecords, methods:methodRecords,
      rules:['只能引用此封包存在的 source_id、literature_id 或 theory_id','無來源不得寫成已證實事實','推論必須列出前提、推論步驟與可能失敗原因']};
  }
  function validateResearchResult(result, packet) {
    if (!result || typeof result !== 'object') return {result, warnings:['AI結果不是物件']};
    const sourceRows = packet?.sources || [];
    const validSources = new Set(sourceRows.map(x=>x.source_id));
    const officialSources = new Set(sourceRows.filter(x=>x.official).map(x=>x.source_id));
    const validLit = new Set((packet?.literature||[]).map(x=>x.literature_id));
    const validTheory = new Set((packet?.theories||[]).map(x=>x.theory_id));
    const warnings = [];
    const clean = JSON.parse(JSON.stringify(result));
    const claimIds = new Set((clean.atomic_claims || []).map(x=>x.claim_id).filter(Boolean));
    for (const claim of (clean.atomic_claims || [])) {
      const requested = Array.isArray(claim.source_ids) ? claim.source_ids : [];
      const kept = requested.filter(id=>validSources.has(id) || validLit.has(id));
      if (kept.length !== requested.length) warnings.push(`主張 ${claim.claim_id||''} 含不存在的來源識別碼，已移除。`);
      claim.source_ids = kept;
      if (!kept.length && ['fact','law'].includes(claim.claim_type)) {
        claim.support = 'insufficient'; claim.confidence = 'low';
        claim.limits = [claim.limits, '沒有可驗證的來源識別碼'].filter(Boolean).join('；');
      }
      if (claim.claim_type === 'law' && !kept.some(id=>officialSources.has(id))) {
        claim.support = 'insufficient'; claim.confidence = 'low';
        claim.limits = [claim.limits, '法律主張缺少官方法源或裁判來源'].filter(Boolean).join('；');
        warnings.push(`法律主張 ${claim.claim_id||''} 缺少官方來源，已降低信心。`);
      }
    }
    clean.literature = (clean.literature || []).filter(item => {
      const ok = item.literature_id && validLit.has(item.literature_id);
      if (!ok && item.literature_id) warnings.push(`文獻 ${item.literature_id} 不在證據封包，已移除。`);
      return ok;
    });
    clean.theories = (clean.theories || []).filter(item => {
      const ok = item.theory_id && validTheory.has(item.theory_id);
      if (!ok && item.theory_id) warnings.push(`理論 ${item.theory_id} 不在證據封包，已移除。`);
      return ok;
    });
    for (const inference of (clean.inference_ledger || [])) {
      const requested = Array.isArray(inference.premises) ? inference.premises : [];
      inference.premises = requested.filter(id=>claimIds.has(id));
      if (inference.premises.length !== requested.length) warnings.push(`推論「${inference.inference||''}」引用不存在的主張ID，已移除。`);
      if (!inference.premises.length) {
        inference.failure_conditions = [...(inference.failure_conditions||[]), '沒有有效的前提主張ID'];
      }
    }
    for (const conflict of (clean.source_conflicts || [])) {
      const requested = Array.isArray(conflict.source_ids) ? conflict.source_ids : [];
      conflict.source_ids = requested.filter(id=>validSources.has(id) || validLit.has(id));
      if (conflict.source_ids.length !== requested.length) warnings.push(`來源衝突「${conflict.issue||''}」含不存在的來源ID，已移除。`);
    }
    return {result:clean,warnings:unique(warnings)};
  }
  function yearFromCrossref(item) {
    const parts = item?.published?.['date-parts'] || item?.issued?.['date-parts'] || item?.created?.['date-parts'];
    return parts?.[0]?.[0] || '';
  }
  function normalizeCrossrefItems(items) {
    return (items || []).map((item,index)=>({
      id:`crossref:${item.DOI||index}`, title:item.title?.[0]||'未提供題名',
      authors:(item.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(' ')), year:yearFromCrossref(item),
      journal:item['container-title']?.[0]||'', doi:item.DOI||'', url:item.URL||doiUrl(item.DOI), type:item.type||'journal-article',
      source:'Crossref', cited_by:item['is-referenced-by-count']||0
    }));
  }
  function normalizeEuropePMCItems(items) {
    return (items || []).map((item,index)=>({
      id:`epmc:${item.id||index}`, title:item.title||'未提供題名', authors:String(item.authorString||'').split(',').map(x=>x.trim()).filter(Boolean),
      year:item.pubYear||'', journal:item.journalTitle||'', doi:item.doi||'',
      url:item.doi?doiUrl(item.doi):`https://europepmc.org/article/${item.source||'MED'}/${item.id||''}`,
      type:'journal_article', source:'Europe PMC', cited_by:Number(item.citedByCount||0), abstract:item.abstractText||''
    }));
  }
  async function fetchBackendLiterature(baseUrl, token, query, source='crossref', rows=10) {
    const base=String(baseUrl||'').replace(/\/$/,'');
    if(!base) throw new Error('未設定學術查詢後端');
    const params=new URLSearchParams({q:query,source,rows:String(Math.min(rows,20))});
    const response=await fetch(`${base}/api/literature?${params}`,{headers:token?{authorization:`Bearer ${token}`}:{}});
    if(!response.ok) throw new Error(`學術後端 HTTP ${response.status}`);
    const data=await response.json();
    return source==='crossref'?normalizeCrossrefItems(data.items):normalizeEuropePMCItems(data.items);
  }
  async function fetchCrossref(query, rows=10) {
    const params = new URLSearchParams({ 'query.bibliographic': query, rows:String(Math.min(rows,20)), select:'DOI,title,author,container-title,published,issued,URL,type,is-referenced-by-count' });
    const response = await fetch(`https://api.crossref.org/works?${params}`);
    if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
    const data = await response.json();
    return normalizeCrossrefItems(data.message?.items || []);
  }
  async function fetchEuropePMC(query, rows=10) {
    const params = new URLSearchParams({query,format:'json',pageSize:String(Math.min(rows,20)),resultType:'core'});
    const response = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`);
    if (!response.ok) throw new Error(`Europe PMC HTTP ${response.status}`);
    const data = await response.json();
    return normalizeEuropePMCItems(data.resultList?.result || []);
  }
  return {normalize, meaningfulTokens, searchLiterature, recommendTheories, recommendMethods, apa, ris, bibtex, downloadText, buildEvidencePacket, validateResearchResult, fetchCrossref, fetchEuropePMC, fetchBackendLiterature, doiUrl};
});
