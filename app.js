'use strict';

const state = {
  runtime: {},
  searchIndex: { documents: [] },
  analyses: [],
  parties: { parties: [], comparison_rules: [] },
  theories: [],
  literature: [],
  conceptOntology: [],
  methodology: {},
  sources: [],
  jurisdictions: [],
  researchMethods: [],
  examples: [],
  route: 'home',
  params: new URLSearchParams(),
  query: '',
  citizenMode: true,
  sourceCountry: 'TW',
  sourceCategory: '',
  sourceQuery: '',
  sourceCoreOnly: true,
  lastLegislationDraft: null,
  theoryQuery: '',
  theoryCategory: '',
  literatureDomain: '',
  liveLiterature: [],
  lastEvidencePacket: null,
};

const LAW_SUFFIXES = ['自治條例', '施行細則', '條例', '通則', '規則', '規程', '辦法', '標準', '準則', '細則', '綱要', '法'];
const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNITS = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function normalize(value) {
  return CivicSearch.normalize(value);
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function safeUrl(value) {
  try {
    const url = new URL(String(value), location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}

function cnNumber(text) {
  if (/^\d+$/.test(text)) return Number(text);
  let total = 0;
  let section = 0;
  let number = 0;
  for (const ch of text) {
    if (ch in CN_DIGITS) number = CN_DIGITS[ch];
    else if (ch in CN_UNITS) {
      const unit = CN_UNITS[ch];
      if (unit === 10000) {
        section = (section + number) * unit;
        total += section;
        section = 0;
        number = 0;
      } else {
        if (number === 0) number = 1;
        section += number * unit;
        number = 0;
      }
    }
  }
  return total + section + number;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || 'home';
  const qpos = raw.indexOf('?');
  const route = qpos >= 0 ? raw.slice(0, qpos) : raw;
  const params = new URLSearchParams(qpos >= 0 ? raw.slice(qpos + 1) : '');
  state.route = ['home', 'reform', 'questions', 'parties', 'theory', 'compare', 'legislation', 'sources', 'ai'].includes(route) ? route : 'home';
  state.params = params;
  if (params.has('q')) state.query = params.get('q') || '';
}

function routeQuery(query) {
  const raw = String(query ?? '').trim();
  if (!raw) return { mode: 'empty', raw };
  const compact = raw.replace(/\s+/g, '');
  const suffix = [...LAW_SUFFIXES].sort((a, b) => b.length - a.length).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const exact = compact.match(new RegExp(`^(.+?(?:${suffix}))第([0-9零〇一二兩三四五六七八九十百千萬]+)(?:之([0-9零〇一二兩三四五六七八九十百千萬]+))?條$`));
  if (exact) {
    const article = cnNumber(exact[2]);
    const sub = exact[3] ? cnNumber(exact[3]) : null;
    return { mode: 'exact_law', raw, law_name: exact[1], article, sub_article: sub, canonical: `${exact[1]}第${article}${sub ? `之${sub}` : ''}條` };
  }
  const ambiguous = compact.match(/^第([0-9零〇一二兩三四五六七八九十百千萬]+)(?:之([0-9零〇一二兩三四五六七八九十百千萬]+))?條$/);
  if (ambiguous) return { mode: 'law_article_ambiguous', raw, article: cnNumber(ambiguous[1]), sub_article: ambiguous[2] ? cnNumber(ambiguous[2]) : null };
  if (LAW_SUFFIXES.some(suffixName => compact.endsWith(suffixName))) return { mode: 'law_name', raw, law_name: compact };
  return { mode: 'fuzzy', raw };
}

function kindLabel(kind) {
  return ({
    analysis: '制度分析',
    official_source: '官方入口',
    party_position: '政黨資料',
    theory: '理論',
    law_guide: '法規入口',
    research_method: '研究方法',
    literature: '期刊文獻',
  })[kind] || kind || '資料';
}

function searchDocuments(query, limit = 15) {
  return CivicSearch.searchDocuments(state.searchIndex.documents, query, limit);
}

function exactLawPanel(parsed) {
  const query = parsed.canonical;
  const ppg = `https://ppg.ly.gov.tw/ppg/bills/search?criteria=keyword&value=${encodeURIComponent(parsed.law_name)}`;
  const law = `https://www.google.com/search?q=${encodeURIComponent(`site:law.moj.gov.tw ${query}`)}`;
  const judgment = `https://www.google.com/search?q=${encodeURIComponent(`site:judgment.judicial.gov.tw ${query}`)}`;
  return `<section class="card exact-law-panel">
    <div class="badges"><span class="badge">法條精確模式</span><span class="badge">不由模型猜測條次</span></div>
    <h2>${esc(query)}</h2>
    <p>依序核對現行條文、沿革、施行日期、立法歷程與裁判適用。搜尋連結只用於定位官方原文。</p>
    <div class="action-row">
      <a class="primary" href="${esc(law)}" target="_blank" rel="noopener noreferrer">核對現行法規</a>
      <a class="secondary" href="${esc(ppg)}" target="_blank" rel="noopener noreferrer">追查立法歷程</a>
      <a class="secondary" href="${esc(judgment)}" target="_blank" rel="noopener noreferrer">查裁判適用</a>
      <button class="secondary copy-button" type="button" data-copy="${esc(query)}">複製查詢詞</button>
    </div>
  </section>`;
}

function resultCard(doc) {
  const raw = String(doc.url || '#');
  const internal = raw.startsWith('#');
  const url = internal ? raw : safeUrl(raw);
  const flags = [kindLabel(doc.kind), doc.country || '', doc.official ? '官方來源' : '', doc.evidence_grade ? `證據 ${doc.evidence_grade}` : ''].filter(Boolean);
  return `<article class="card result-card">
    <div class="badges">${flags.map(flag => `<span class="badge">${esc(flag)}</span>`).join('')}</div>
    <h3>${esc(doc.title)}</h3>
    <p>${esc(String(doc.body || '').slice(0, 280))}${String(doc.body || '').length > 280 ? '……' : ''}</p>
    <p class="match-reason"><strong>符合原因：</strong>${esc(doc.match_reason || '詞彙相關')}</p>
    ${url !== '#' ? `<a class="source-link" href="${esc(url)}" ${internal ? '' : 'target="_blank" rel="noopener noreferrer"'}>${internal ? '在本站查看' : '開啟來源'}</a>` : ''}
  </article>`;
}


function literatureById(id) { return state.literature.find(item => item.id === id); }
function theoryById(id) { return state.theories.find(item => item.id === id); }
function queryInsightPanel(query, results) {
  if (!String(query || '').trim()) return '';
  const plan = CivicSearch.planQuery(query);
  const methods = CivicAcademic.recommendMethods(state.researchMethods, query, 3);
  const theories = CivicAcademic.recommendTheories(state.theories, query, 4);
  const papers = CivicAcademic.searchLiterature(state.literature, query, {limit:5, minScore:4});
  const evidence = results.filter(item => item.kind !== 'theory' && item.kind !== 'research_method' && item.kind !== 'literature');
  const status = evidence.length >= 3 ? '已有多項可定位資料' : evidence.length ? '只有有限可定位資料' : '本站本地索引不足';
  return `<section class="card query-insight">
    <div class="badges"><span class="badge">查詢意圖：${esc(plan.primary_intent)}</span><span class="badge">${esc(status)}</span></div>
    <h2>系統如何理解這個問題</h2>
    <div class="grid-2"><div><h3>檢索策略</h3><p><strong>核心詞：</strong>${esc(plan.terms.join('、') || '未辨識')}</p><p><strong>受控名稱變體：</strong>${esc(plan.controlled_aliases.map(x => x.term).join('、') || '無')}</p><p class="muted">${esc(plan.excluded_rule)}</p></div>
    <div><h3>推論邊界</h3><p>${evidence.length ? '目前結果可用於定位來源與形成待查主張；尚不能直接證明政策有效、違法或應修法。' : '目前只能建立查詢與研究路徑，不能形成實質結論。'}</p><p><a href="#theory?q=${encodeURIComponent(query)}">查看相符學說與期刊文獻</a></p></div></div>
    <details open><summary>建議的最小充分研究組合</summary>
      <div class="grid-3">
        <div><h4>研究方法</h4><ul>${(methods.length?methods:[methodRecommendation(query).primary].filter(Boolean)).map(x=>`<li>${esc(x.name)}</li>`).join('')}</ul></div>
        <div><h4>分析學說</h4><ul>${theories.length?theories.map(x=>`<li><a href="#theory?theory=${encodeURIComponent(x.id)}">${esc(x.name)}</a></li>`).join(''):'<li>尚無高相關理論，應先界定問題。</li>'}</ul></div>
        <div><h4>基礎文獻</h4><ul>${papers.length?papers.map(x=>`<li><a href="${esc(CivicAcademic.doiUrl(x.doi))}" target="_blank" rel="noopener noreferrer">${esc(x.authors[0]||'')}（${esc(x.year)}）</a></li>`).join(''):'<li>可到學說與期刊頁進行 Crossref／Europe PMC 查詢。</li>'}</ul></div>
      </div>
    </details>
  </section>`;
}

function renderSearchResults(query) {
  const parsed = routeQuery(query);
  if (parsed.mode === 'empty') return '<div class="empty">輸入一般問題、政策名稱、機關、法案或完整法條。</div>';
  if (parsed.mode === 'exact_law') {
    const related = searchDocuments(`${parsed.law_name} 第${parsed.article}條`, 8);
    return `${exactLawPanel(parsed)}<h2>本站相關索引</h2>${related.length ? related.map(resultCard).join('') : '<div class="empty">本站索引尚無直接結果；不代表官方資料不存在。</div>'}`;
  }
  if (parsed.mode === 'law_article_ambiguous') {
    return `<section class="card danger-note"><h2>缺少法規名稱</h2><p>請輸入完整格式，例如「個人資料保護法第19條」。</p></section>`;
  }
  const results = searchDocuments(parsed.raw, 15);
  const expansion = CivicSearch.explainExpansion(parsed.raw);
  const direct = results.filter(result => result.tier === 'direct');
  const related = results.filter(result => result.tier === 'related');
  return `${queryInsightPanel(parsed.raw, results)}<div class="search-mode">
      <span class="badge">${parsed.mode === 'law_name' ? '法規名稱搜尋' : '詞彙證據搜尋'}</span>
      <span>${results.length} 筆結果</span>
      ${expansion.length ? `<details><summary>受控名稱變體</summary>${expansion.map(item => `<span class="badge">${esc(item.term)} × ${item.weight}</span>`).join(' ')}</details>` : ''}
    </div>
    ${direct.length ? `<section class="result-group"><h2>直接命中</h2>${direct.map(resultCard).join('')}</section>` : ''}
    ${related.length ? `<section class="result-group"><h2>名稱變體或部分關鍵字命中</h2>${related.map(resultCard).join('')}</section>` : ''}
    ${!results.length ? `<section class="card notice"><h2>沒有足夠相關的本地索引結果</h2><p>系統不會用「官方」身分硬塞無關資料。可改用較正式的政策名稱、法規全名或主管機關，也可啟用 AI 研究工作流產生查詢策略。</p></section>` : ''}
    <div class="action-row">
      <button class="primary" type="button" id="research-query" data-query="${esc(parsed.raw)}">用 AI 建立研究摘要</button>
      <a class="secondary" href="#sources">到多國官方入口</a>
    </div>
    <div id="research-query-output"></div>`;
}

function examplesHtml() {
  return `<div class="example-chips" aria-label="一般民眾常見問題">${state.examples.map(example => `<button type="button" class="example-chip" data-query="${esc(example.query)}">${esc(example.label)}</button>`).join('')}</div>`;
}

function searchShell(query = '') {
  return `<section class="search-shell">
    <form id="search-form" class="search-row">
      <input id="global-search" name="q" value="${esc(query)}" autocomplete="off" placeholder="例如：政府今年把錢花在哪裡？個人資料保護法第19條" aria-label="搜尋國家資料"/>
      <button class="primary" type="submit">搜尋</button>
    </form>
    ${examplesHtml()}
    <p class="search-hint">搜尋先依詞彙證據排序；僅展開正式名稱與常用縮寫，不把同一議題的不同概念誤當近義詞。AI 查詢擴張必須由使用者主動啟用並顯示展開詞。</p>
  </section>`;
}

function homePage() {
  return `${searchShell(state.query)}
    <section id="search-results">${renderSearchResults(state.query)}</section>
    <section class="grid-4">
      <article class="card"><div class="kpi">${esc(state.sources.length)}</div><h3>多國官方入口</h3><p>按國家與資料類別定位法規、國會、裁判、預算、統計與審計。</p></article>
      <article class="card"><div class="kpi">3</div><h3>AI 資源模式</h3><p>節能一階、標準二階、高風險三階；只有需要時才增加模型批判。</p></article>
      <article class="card"><div class="kpi">${esc(state.researchMethods.length)}</div><h3>研究方法引擎</h3><p>依問題類型選擇法釋義、因果推論、比較法、執行研究或混合方法。</p></article>
      <article class="card"><div class="kpi">XLSX</div><h3>修法三版本</h3><p>最小、權衡、制度性三種版本，含理由、風險、配套與 Excel 輸出。</p></article>
    </section>`;
}

function methodRecommendation(question) {
  const normalized = normalize(question);
  const scores = state.researchMethods.map(method => ({
    method,
    score: (method.triggers || []).reduce((sum, trigger) => sum + (normalized.includes(normalize(trigger)) ? 3 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  const primary = scores[0]?.score > 0 ? scores[0].method : state.researchMethods.find(method => method.id === 'mixed') || state.researchMethods[0];
  const supplemental = scores.filter(item => item.method.id !== primary.id && item.score > 0).slice(0, 1).map(item => item.method);
  return { primary, supplemental };
}

function methodCard(question) {
  const recommendation = methodRecommendation(question);
  if (!recommendation.primary) return '';
  const method = recommendation.primary;
  return `<article class="card method-card">
    <div class="badge">主要研究方法</div>
    <h3>${esc(method.name)}</h3>
    <p><strong>選擇理由：</strong>${esc(method.why)}</p>
    <ol>${(method.steps || []).map(step => `<li>${esc(step)}</li>`).join('')}</ol>
    <p><strong>限制：</strong>${esc(method.caveat)}</p>
    ${recommendation.supplemental.length ? `<p><strong>必要時補充：</strong>${esc(recommendation.supplemental[0].name)}</p>` : ''}
  </article>`;
}

function reformPage() {
  return `<h2>國家改革分析</h2>
    <section class="card notice"><p>改革判斷不是單純真偽題。系統分開問題規模、現行法、政策工具、政治可行性、執行能力與價值取捨。</p></section>
    <form id="reform-form" class="form-grid card">
      <label>議題<input name="topic" required placeholder="例如：電價調整決策透明度"/></label>
      <label>主要機關<input name="agency" placeholder="例如：經濟部、台電、立法院"/></label>
      <label class="full">目前掌握的官方資料或來源網址<textarea name="evidence" required placeholder="可貼官方資料摘要與網址；不要貼個資"></textarea></label>
      <label class="full">希望釐清的核心問題<textarea name="goal" required placeholder="例如：調整依據、成本結構、替代方案及分配效果"></textarea></label>
      <label>輸出模式<select name="audience"><option value="citizen">公民易讀</option><option value="research">研究摘要</option><option value="policy">政策備忘錄</option></select></label>
      <div class="full action-row"><button class="primary" type="submit">建立研究設計</button><button class="secondary ai-action" type="button" data-task="research" data-form="reform-form" data-output="reform-output">AI 批判與綜合</button></div>
    </form>
    <div id="reform-output" class="output-panel empty">尚未產生。</div>`;
}

function questionsPage() {
  return `<h2>立法委員質詢題庫</h2>
    <section class="card notice"><p>質詢題目從證據缺口、法源、政策選擇、預算執行、責任與期限導出，不先預設違法或失職。</p></section>
    <form id="question-form" class="form-grid card">
      <label>議題<input name="topic" required placeholder="例如：少子化預算成效"/></label>
      <label>被詢答機關<input name="agency" required placeholder="例如：行政院、教育部、衛福部"/></label>
      <label class="full">官方資料與資料缺口<textarea name="evidence" required></textarea></label>
      <label class="full">希望取得的可驗證答案<textarea name="goal" required></textarea></label>
      <div class="full action-row"><button class="primary" type="submit">產生分層質詢</button><button class="secondary ai-action" type="button" data-task="research" data-form="question-form" data-output="question-output">AI 強化追問與反方</button></div>
    </form>
    <div id="question-output" class="output-panel empty">尚未產生。</div>`;
}

function partiesPage() {
  const parties = state.parties.parties || [];
  return `<h2>政黨政策立場一致性與變動分析</h2>
    <section class="card notice"><p>比較必須對齊議題、日期、發言主體、文件層級、條件與原文。不同時間的調整不當然等於矛盾。</p></section>
    <form id="party-form" class="form-grid card">
      <label class="full">比較議題<input name="issue" required placeholder="例如：核能政策、住宅政策、國會改革"/></label>
      ${parties.map(party => `<fieldset class="card"><legend>${esc(party.name)}</legend><label>日期<input name="${esc(party.id)}_date" type="date"/></label><label>官方來源<input name="${esc(party.id)}_url" type="url"/></label><label>正式主張<textarea name="${esc(party.id)}_text" class="compact-textarea"></textarea></label></fieldset>`).join('')}
      <div class="full action-row"><button class="primary" type="submit">檢查可比性</button><button class="secondary ai-action" type="button" data-task="research" data-form="party-form" data-output="party-output">AI 比較主張</button></div>
    </form>
    <div id="party-output" class="output-panel empty">尚未輸入可比較資料。</div>`;
}


function literatureCard(item, compactMode = false) {
  const citation = CivicAcademic.apa(item);
  return `<article class="card literature-card" id="lit-${esc(item.id)}">
    <div class="badges"><span class="badge">${esc(['journal_article','journal-article','article-journal'].includes(item.type) ? '期刊論文' : '會議或其他研究文獻')}</span><span class="badge">${esc(item.year)}</span>${item.peer_reviewed ? '<span class="badge">同儕審查</span>' : ''}</div>
    <h3>${esc(item.title)}</h3><p>${esc((item.authors||[]).join('、'))}</p><p><em>${esc(item.journal||'')}</em></p>
    ${compactMode ? '' : `<p><strong>適合用途：</strong>${esc(item.use||'')}</p><p><strong>限制：</strong>${esc(item.limitation||'')}</p>`}
    <div class="action-row"><a class="secondary" href="${esc(CivicAcademic.doiUrl(item.doi)||item.url)}" target="_blank" rel="noopener noreferrer">DOI／原始頁面</a><button type="button" class="secondary copy-button" data-copy="${esc(citation)}">複製 APA</button></div>
  </article>`;
}
function theoryCard(theory) {
  const refs=(theory.literature_ids||[]).map(literatureById).filter(Boolean);
  return `<article class="card theory-card" id="theory-${esc(theory.id)}"><div class="badges"><span class="badge">${esc(theory.category)}</span></div><h3>${esc(theory.name)}</h3>
    <p><strong>核心主張：</strong>${esc(theory.proposition)}</p>
    <details open><summary>作用機制與診斷問題</summary><div class="grid-2"><div><h4>作用機制</h4><ul>${(theory.mechanisms||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div><h4>診斷問題</h4><ul>${(theory.diagnostic_questions||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div></details>
    <p><strong>適用：</strong>${esc(theory.when_to_use)}</p><p><strong>限制：</strong>${esc(theory.limitations)}</p>
    <p><strong>建議方法：</strong>${esc((theory.suitable_methods||[]).map(id=>state.researchMethods.find(x=>x.id===id)?.name||id).join('、'))}</p>
    <h4>代表性文獻</h4><ul class="reference-list">${refs.map(ref=>`<li><a href="${esc(CivicAcademic.doiUrl(ref.doi))}" target="_blank" rel="noopener noreferrer">${esc(CivicAcademic.apa(ref))}</a></li>`).join('')}</ul></article>`;
}
function theoryPage() {
  const query=state.params.get('q')||state.theoryQuery||''; const selected=state.params.get('theory')||''; const litSelected=state.params.get('lit')||'';
  const categories=[...new Set(state.theories.map(x=>x.category))].sort();
  let theories=selected?state.theories.filter(x=>x.id===selected):CivicAcademic.recommendTheories(state.theories,query,50);
  if(!query&&!selected) theories=state.theories;
  if(state.theoryCategory) theories=theories.filter(x=>x.category===state.theoryCategory);
  let papers=litSelected?state.literature.filter(x=>x.id===litSelected):CivicAcademic.searchLiterature(state.literature,query||state.theoryCategory,{limit:30,minScore:query||state.theoryCategory?3:0,domain:state.literatureDomain});
  if(!query&&!state.theoryCategory&&!state.literatureDomain&&!litSelected) papers=state.literature.slice().sort((a,b)=>b.year-a.year);
  return `<h2>學說、研究方法與期刊論文</h2><section class="card notice"><p>學說不是裝飾性標籤。每張卡片均列核心主張、作用機制、可檢查問題、適用限制及代表性期刊文獻。文獻可以支撐理論選擇，不能取代個案的官方資料與研究設計。</p></section>
    <form id="academic-form" class="source-toolbar card"><label>研究問題或關鍵字<input id="academic-query" value="${esc(query)}" placeholder="例如：政策執行為何出現中央地方落差？"/></label><label>理論類別<select id="academic-category"><option value="">全部類別</option>${categories.map(x=>`<option ${state.theoryCategory===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label><label>文獻領域<input id="academic-domain" value="${esc(state.literatureDomain)}" placeholder="例如：因果推論、實施科學"/></label><button class="primary" type="submit">分析並找文獻</button></form>
    <section class="card academic-actions"><div><strong>即時學術中繼資料：</strong>先查本地人工整理文獻；需要擴充時再呼叫公開API，不消耗LLM額度。</div><div class="action-row"><button id="crossref-search" type="button" class="secondary">查 Crossref</button><button id="epmc-search" type="button" class="secondary">查 Europe PMC（醫療／健康）</button><button id="export-ris" type="button" class="secondary">下載 RIS</button><button id="export-bib" type="button" class="secondary">下載 BibTeX</button></div><div id="academic-live-status" class="status-line"></div></section>
    <div class="split-pane academic-layout"><section><h2>建議學說（${theories.length}）</h2><div id="theory-results">${theories.length?theories.map(theoryCard).join(''):'<div class="empty">沒有高相關學說。請換用較明確的機制、行為者或結果詞。</div>'}</div></section><section><h2>本地代表性文獻（${papers.length}）</h2><div id="literature-results">${papers.length?papers.map(x=>literatureCard(x,true)).join(''):'<div class="empty">本地目錄沒有直接命中，可使用 Crossref 或 Europe PMC。</div>'}</div><h2>即時查詢結果</h2><div id="live-literature-results" class="empty">尚未呼叫公開學術API。</div></section></div>`;
}

function comparePage() {
  const checks = state.jurisdictions.filter(jurisdiction => jurisdiction.code !== 'INT').map(jurisdiction => `<label><input type="checkbox" name="countries" value="${esc(jurisdiction.code)}" ${['TW', 'JP', 'UK'].includes(jurisdiction.code) ? 'checked' : ''}/><span>${esc(jurisdiction.name)}</span></label>`).join('');
  return `<h2>跨國比較與研究方法</h2>
    <section class="card notice"><p>先定義共同功能問題，再以相同分析問題比較各國；不依「先進國家」標籤任意選國，也不把外國制度直接移植。</p></section>
    <div class="split-pane">
      <form id="compare-form" class="card mini-form sticky-card">
        <label>研究問題<textarea name="question" required placeholder="例如：臺灣、日本與英國如何管理高齡駕駛風險？"></textarea></label>
        <div><strong>比較法域（最多5個）</strong><div class="checkbox-grid">${checks}</div></div>
        <label>可用資料<input name="available" placeholder="法規、事故統計、政策評估、預算、訪談等"/></label>
        <div class="action-row"><button class="primary" type="submit">建立比較設計</button><button class="secondary ai-action" type="button" data-task="research" data-form="compare-form" data-output="compare-output">AI 完整比較架構</button></div>
      </form>
      <section><div id="method-result" class="empty">輸入問題後推薦研究方法、比較維度與官方入口。</div><div id="compare-output"></div></section>
    </div>`;
}

function renderDraftTable(draft) {
  return `<section class="draft-result">
    <div class="action-row"><button class="primary" id="download-draft-xlsx" type="button">下載 Excel（.xlsx）</button><button class="secondary" id="copy-draft-json" type="button">複製結構化草稿</button></div>
    <div class="table-wrap"><table class="draft-table"><thead><tr><th>版本</th><th>策略定位</th><th>修正條文草稿</th><th>修法理由</th><th>優點</th><th>風險與配套</th></tr></thead><tbody>
    ${draft.versions.map(version => `<tr><td><strong>${esc(version.name)}</strong></td><td>${esc(version.strategy)}</td><td>${esc(version.amendedText)}</td><td><ol>${(version.reasons || []).map(reason => `<li>${esc(reason)}</li>`).join('')}</ol></td><td><ul>${(version.benefits || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul></td><td><ul>${(version.risks || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul><p><strong>執行：</strong>${esc(version.implementation || '')}</p><p><strong>財政：</strong>${esc(version.fiscalImpact || '')}</p></td></tr>`).join('')}
    </tbody></table></div>
    <section class="card"><h3>共同待查核事項</h3><ol>${(draft.sharedChecks || []).map(item => `<li>${esc(item)}</li>`).join('')}</ol></section>
  </section>`;
}

function legislationPage() {
  return `<h2>人工智慧／規則式修法草案</h2>
    <section class="card danger-note"><p>先產生三種政策強度版本，再由 AI 依現行條文逐句潤飾。未提供現行條文時，系統只建立策略框架，不虛構法條。</p></section>
    <form id="draft-form" class="form-grid card">
      <label>法規名稱<input name="law" required placeholder="例如：個人資料保護法"/></label>
      <label>條次<input name="article" required placeholder="例如：第19條"/></label>
      <label class="full">現行條文<textarea name="current_text" placeholder="建議從全國法規資料庫貼入完整現行條文"></textarea></label>
      <label class="full">制度問題與證據<textarea name="problem" required placeholder="說明制度問題、證據與不能過度推論之處"></textarea></label>
      <label class="full">政策目的<textarea name="goal" required placeholder="說明公共利益、受影響群體與預期結果"></textarea></label>
      <label class="full">擬修正方向<textarea name="change" required placeholder="說明主體、要件、程序、期限、法律效果與配套"></textarea></label>
      <label class="full">官方來源網址（每行一個）<textarea name="sources" class="compact-textarea"></textarea></label>
      <div class="full action-row"><button class="primary" type="submit">產生三種規則式版本</button><button class="secondary ai-action" type="button" data-task="legislation" data-form="draft-form" data-output="draft-output">AI 逐句潤稿三版本</button></div>
    </form>
    <div id="draft-output" class="output-panel empty">尚未產生草稿。</div>`;
}

function countryOptions(selected) {
  return state.jurisdictions.map(jurisdiction => `<option value="${esc(jurisdiction.code)}" ${jurisdiction.code === selected ? 'selected' : ''}>${esc(jurisdiction.name)}</option>`).join('');
}

function sourceCard(source) {
  return `<article class="card portal-card"><div class="badges"><span class="badge">${esc(source.portal_category)}</span><span class="badge">${esc(source.level)}</span></div><h3>${esc(source.name)}</h3><p>${esc(source.best_for)}</p><a class="primary" href="${esc(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">開啟官方入口</a><details class="research-only"><summary>研究使用與限制</summary><p>${esc(source.data)}</p><p>${esc(source.limitations)}</p></details></article>`;
}

function filteredSources() {
  const query = normalize(state.sourceQuery);
  return state.sources.filter(source =>
    (!state.sourceCountry || source.country_code === state.sourceCountry)
    && (!state.sourceCategory || source.portal_category === state.sourceCategory)
    && (!state.sourceCoreOnly || source.priority === 1)
    && (!query || normalize(`${source.name} ${source.agency} ${source.data} ${source.best_for} ${source.portal_category}`).includes(query))
  ).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'zh-Hant'));
}

function sourcesPage() {
  const selected = state.sourceCountry || 'TW';
  const categories = [...new Set(state.sources.filter(source => source.country_code === selected).map(source => source.portal_category))].sort();
  const rows = filteredSources();
  return `<h2>國家資料與政府文檔入口</h2>
    <section class="card notice"><p>預設只顯示研究最常用的核心入口。先選國家，再選法規、國會、司法、預算、統計、審計或政策研究。</p></section>
    <section class="source-toolbar card">
      <label>國家／法域<select id="source-country">${countryOptions(selected)}</select></label>
      <label>資料類別<select id="source-category"><option value="">全部類別</option>${categories.map(category => `<option value="${esc(category)}" ${state.sourceCategory === category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
      <label>篩選<input id="source-filter" value="${esc(state.sourceQuery)}" placeholder="例如：預算、裁判、統計"/></label>
      <label class="inline-check"><input id="source-core" type="checkbox" ${state.sourceCoreOnly ? 'checked' : ''}/>只顯示核心入口</label>
      <label class="inline-check"><input id="research-mode" type="checkbox" ${state.citizenMode ? '' : 'checked'}/>顯示研究限制</label>
    </section>
    <p><strong id="source-count">${rows.length}</strong> 個入口</p><div id="source-grid" class="portal-grid">${rows.map(sourceCard).join('')}</div>`;
}

function getAIConfig() {
  try { return JSON.parse(sessionStorage.getItem('civic-ai-config') || '{}'); } catch { return {}; }
}

function setAIConfig(config) {
  sessionStorage.setItem('civic-ai-config', JSON.stringify(config));
}

function aiPage() {
  const cfg = getAIConfig();
  return `<h2>免費 AI、資源模式與虛擬後端</h2>
    <section class="card danger-note"><p>免費額度、模型名稱與速率限制會變動。OpenRouter 僅接受價格欄位明確為零的模型；Gemini 與 Groq 的模型清單不能證明帳戶不會被計費，必須由使用者先確認方案。系統不自動轉付費。</p></section>
    <form id="ai-form" class="form-grid card">
      <label>使用方式<select name="connection"><option value="backend" ${cfg.connection === 'backend' ? 'selected' : ''}>受控虛擬後端（建議）</option><option value="direct" ${cfg.connection !== 'backend' ? 'selected' : ''}>瀏覽器自備 Key</option></select></label>
      <label>資源模式<select name="resource_mode"><option value="auto" ${!cfg.resource_mode || cfg.resource_mode === 'auto' ? 'selected' : ''}>自動：依問題風險決定1～3次</option><option value="economy" ${cfg.resource_mode === 'economy' ? 'selected' : ''}>節能：1次主要呼叫</option><option value="standard" ${cfg.resource_mode === 'standard' ? 'selected' : ''}>標準：規劃＋綜合</option><option value="critical" ${cfg.resource_mode === 'critical' ? 'selected' : ''}>高風險：規劃＋批判＋綜合</option></select></label>
      <label class="full">Hugging Face Space／受控後端網址<input name="backend_url" value="${esc(cfg.backend_url || '')}" placeholder="https://你的-space.hf.space"/></label>
      <label class="full">後端存取權杖（選填）<input name="backend_token" type="password" value="${esc(cfg.backend_token || '')}"/></label>
      <label>直接供應商<select name="provider"><option value="openrouter" ${cfg.provider === 'openrouter' ? 'selected' : ''}>OpenRouter 零價格模型</option><option value="gemini" ${cfg.provider === 'gemini' ? 'selected' : ''}>Gemini（須自行確認免費層）</option><option value="groq" ${cfg.provider === 'groq' ? 'selected' : ''}>Groq（須自行確認開發方案）</option></select></label>
      <label>模型<select name="model"><option value="${esc(cfg.model || '')}">${esc(cfg.model || '先檢查模型')}</option></select></label>
      <label class="full">API Key<input name="key" type="password" value="${esc(cfg.key || '')}" autocomplete="off"/></label>
      <label>OpenRouter 推論供應商（選填）<input name="actual_provider" value="${esc(cfg.actual_provider || '')}" placeholder="例如 Google 或 Groq"/></label>
      <label>本分頁呼叫上限<input name="daily_limit" type="number" min="1" max="50" value="${esc(cfg.daily_limit || 8)}"/></label>
      <label class="full"><input name="confirm" type="checkbox" ${cfg.confirm ? 'checked' : ''}/>我了解：僅能外送公開資料；免費模型可能停用；不保證服務水準；系統不自動轉付費。</label>
      <div class="full action-row"><button id="test-backend" class="primary" type="button">測試虛擬後端</button><button id="discover-models" class="secondary" type="button">檢查免費模型</button><button class="secondary" type="submit">儲存到本分頁</button><button id="clear-ai" class="danger-button" type="button">清除</button></div>
      <div id="ai-status" class="full status-line">${cfg.backend_url ? `已設定後端：${esc(cfg.backend_url)}` : cfg.model ? `已設定：${esc(cfg.provider)} / ${esc(cfg.model)}` : '尚未設定；本地搜尋、研究方法與規則式草稿仍可使用。'}</div>
    </form>
    <section class="grid-2"><article class="card"><h3>最省資源的策略</h3><ol><li>規則式分類與搜尋先行，不用模型做可重現的工作。</li><li>一般問題只做一次結構化呼叫。</li><li>法律、指控、跨國或證據衝突才啟動第二、第三階段批判。</li><li>中間結果短而結構化，避免多模型重複寫長文。</li></ol></article><article class="card"><h3>虛擬空間</h3><p>ZIP 內含 <code>backend/hf-space</code>，可部署為 Hugging Face Docker Space，將 Gemini、Groq、OpenRouter 等金鑰存為 Space Secrets；網站只連到後端，不在瀏覽器暴露金鑰。</p><p><a href="https://huggingface.co/new-space" target="_blank" rel="noopener noreferrer">建立 Hugging Face Space</a></p></article></section>`;
}

function pageFor(route) {
  return ({ home: homePage, reform: reformPage, questions: questionsPage, parties: partiesPage, theory: theoryPage, compare: comparePage, legislation: legislationPage, sources: sourcesPage, ai: aiPage }[route] || homePage)();
}

function formDataObject(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
    else data[key] = value;
  }
  return data;
}

function researchStatusLabel(value) {
  return ({supported:'有充分支持',partially_supported:'部分支持',insufficient:'證據不足',contested:'來源衝突',normative:'價值／規範判斷'}[value] || value || '未標示');
}
function confidenceLabel(value) {
  return ({high:'高',medium:'中',low:'低'}[value] || value || '未標示');
}
function supportLabel(value) {
  return ({direct:'直接支持',partial:'部分支持',insufficient:'不足',contested:'有爭議'}[value] || value || '未標示');
}
function packetSource(id) {
  return (state.lastEvidencePacket?.sources || []).find(item => item.source_id === id);
}
function packetSourceText(ids) {
  return (ids || []).map(id => {
    const source = packetSource(id);
    return source ? `${id}｜${source.title}` : id;
  }).join('；');
}
function renderResearchResult(result, trace = [], validationWarnings = []) {
  const data = result?.result || result;
  if (!data || typeof data !== 'object') return `<pre>${esc(JSON.stringify(result, null, 2))}</pre>`;
  const claims = data.atomic_claims || (data.findings||[]).map((x,i)=>({claim_id:`C${i+1}`,claim:x.claim,claim_type:'fact',source_ids:[x.source].filter(Boolean),support:x.support,confidence:x.confidence,limits:x.evidence}));
  const citedLiterature = (data.literature || []).map(item => ({...item, record: literatureById(item.literature_id)}));
  const packetSources = state.lastEvidencePacket?.sources || [];
  return `<section class="research-dossier">
    <div class="badges"><span class="badge">${esc(data.question_type || '研究摘要')}</span><span class="badge">狀態：${esc(researchStatusLabel(data.answer_status))}</span><span class="badge">信心：${esc(confidenceLabel(data.confidence))}</span>${trace.map(item => `<span class="badge">${esc(item.stage)} / ${esc(item.model)}</span>`).join('')}</div>
    <h3>${esc(data.research_question || '研究問題')}</h3>
    ${data.scope?`<p class="scope-note"><strong>回答範圍：</strong>${esc(data.scope)}</p>`:''}
    ${data.direct_answer?`<section class="card direct-answer"><h4>直接回答</h4><p>${esc(data.direct_answer)}</p></section>`:''}
    ${data.executive_summary?`<section class="card executive-summary"><h4>精準摘要</h4><p>${esc(data.executive_summary)}</p></section>`:''}
    ${(data.what_cannot_be_concluded||[]).length?`<section class="card caution-note"><h4>目前不能下的結論</h4><ul>${data.what_cannot_be_concluded.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:''}
    ${validationWarnings.length?`<section class="card danger-note"><h4>來源驗證警告</h4><ul>${validationWarnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:''}
    ${claims.length?`<h4>原子主張—證據矩陣</h4><div class="table-wrap"><table><thead><tr><th>ID</th><th>主張</th><th>性質</th><th>來源</th><th>支持</th><th>反證／衝突</th><th>信心</th><th>限制</th></tr></thead><tbody>${claims.map(x=>`<tr><td>${esc(x.claim_id||'')}</td><td>${esc(x.claim||'')}</td><td>${esc(x.claim_type||'')}</td><td>${esc(packetSourceText(x.source_ids||[]))}</td><td>${esc(supportLabel(x.support))}</td><td>${esc(x.counterevidence||'')}</td><td>${esc(confidenceLabel(x.confidence))}</td><td>${esc(Array.isArray(x.limits)?x.limits.join('；'):x.limits||'')}</td></tr>`).join('')}</tbody></table></div>`:''}
    ${(data.source_conflicts||[]).length?`<h4>來源衝突</h4><div class="table-wrap"><table><thead><tr><th>爭點</th><th>來源</th><th>處理方式</th></tr></thead><tbody>${data.source_conflicts.map(x=>`<tr><td>${esc(x.issue||'')}</td><td>${esc(packetSourceText(x.source_ids||[]))}</td><td>${esc(x.handling||'')}</td></tr>`).join('')}</tbody></table></div>`:''}
    ${(data.inference_ledger||[]).length?`<h4>推論帳本</h4><div class="table-wrap"><table><thead><tr><th>推論</th><th>前提主張</th><th>推論方式</th><th>可能失敗原因</th></tr></thead><tbody>${data.inference_ledger.map(x=>`<tr><td>${esc(x.inference||'')}</td><td>${esc((x.premises||[]).join('；'))}</td><td>${esc(x.reasoning||'')}</td><td>${esc((x.failure_conditions||[]).join('；'))}</td></tr>`).join('')}</tbody></table></div>`:''}
    ${data.legal_policy_split ? `<div class="grid-2"><article class="card"><h4>法律形成</h4><p>${esc(data.legal_policy_split.law || '')}</p><h4>政治／議事</h4><p>${esc(data.legal_policy_split.politics || '')}</p></article><article class="card"><h4>政策形成</h4><p>${esc(data.legal_policy_split.policy || '')}</p><h4>執行</h4><p>${esc(data.legal_policy_split.implementation || '')}</p></article></div>` : ''}
    ${(data.theories||[]).length?`<h4>學說適用與可檢驗命題</h4><div class="grid-3">${data.theories.map(x=>{const record=theoryById(x.theory_id);return `<article class="card"><strong>${record?`<a href="#theory?theory=${encodeURIComponent(record.id)}">${esc(record.name)}</a>`:esc(x.name||x.theory_id||'')}</strong><p>${esc(x.application||'')}</p>${x.testable_implication?`<p><strong>可檢驗命題：</strong>${esc(x.testable_implication)}</p>`:''}<p><strong>限制：</strong>${esc(x.limitation||record?.limitations||'')}</p></article>`;}).join('')}</div>`:''}
    ${citedLiterature.length?`<h4>引用文獻與用途</h4><ul class="reference-list">${citedLiterature.map(x=>{const ref=x.record;return `<li>${ref?`<a href="${esc(CivicAcademic.doiUrl(ref.doi))}" target="_blank" rel="noopener noreferrer">${esc(CivicAcademic.apa(ref))}</a>`:esc(x.literature_id||'')}<br/><span>${esc(x.relevance||'')}</span>${x.limitation?`<br/><small>限制：${esc(x.limitation)}</small>`:''}</li>`;}).join('')}</ul>`:''}
    ${(data.methods || []).length ? `<h4>研究方法</h4>${data.methods.map(method => `<article class="card"><strong>${esc(method.name)}</strong><p>${esc(method.why)}</p><p><strong>設計：</strong>${esc(method.design)}</p><p><strong>需要資料：</strong>${esc(method.data_needed)}</p>${method.identification_assumptions?`<p><strong>識別假設：</strong>${esc(method.identification_assumptions)}</p>`:''}<p><strong>限制：</strong>${esc(method.limitation||'')}</p></article>`).join('')}` : ''}
    ${(data.alternatives||data.counterarguments||[]).length?`<h4>替代方案與反方</h4><ul>${(data.alternatives||data.counterarguments||[]).map(x=>typeof x==='string'?`<li>${esc(x)}</li>`:`<li><strong>${esc(x.option||'')}</strong>：${esc(x.advantage||'')}；風險：${esc(x.risk||'')}</li>`).join('')}</ul>`:''}
    ${(data.uncertainties||data.limitations||[]).length?`<h4>不確定性與限制</h4><ul>${(data.uncertainties||data.limitations||[]).map(x=>`<li>${esc(typeof x==='string'?x:x.issue||JSON.stringify(x))}</li>`).join('')}</ul>`:''}
    ${(data.next_actions||data.next_steps||[]).length?`<h4>下一步</h4><ol>${(data.next_actions||data.next_steps||[]).map(x=>`<li>${esc(typeof x==='string'?x:x.action||JSON.stringify(x))}</li>`).join('')}</ol>`:''}
    ${packetSources.length?`<details class="card evidence-packet-view"><summary>本次證據封包（${packetSources.length}筆）</summary><div class="table-wrap"><table><thead><tr><th>ID</th><th>來源</th><th>屬性</th><th>網址</th></tr></thead><tbody>${packetSources.map(x=>`<tr><td>${esc(x.source_id)}</td><td>${esc(x.title)}</td><td>${x.official?'官方':''}${x.peer_reviewed?'同儕審查':''}</td><td>${x.url?`<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">開啟</a>`:''}</td></tr>`).join('')}</tbody></table></div></details>`:''}
  </section>`;
}

function localResearchPlan(data) {
  const query = `${data.topic || data.question || data.issue || ''} ${data.goal || ''}`;
  const sources = searchDocuments(query, 8);
  const plan = CivicSearch.planQuery(query);
  const theories = CivicAcademic.recommendTheories(state.theories, query, 4);
  const papers = CivicAcademic.searchLiterature(state.literature, query, {limit:5,minScore:3});
  const methods = CivicAcademic.recommendMethods(state.researchMethods, query, 3);
  return `<section class="research-dossier"><h3>不使用AI的研究前置分析</h3><section class="card"><p><strong>問題類型：</strong>${esc(plan.intents.join('、'))}</p><p><strong>可先定位的本地來源：</strong>${sources.length}項</p><p><strong>目前可做：</strong>建立主張清單、來源定位、研究設計與理論假設。</p><p><strong>目前不可做：</strong>在未讀取原始全文與確認日期效力前，不宣稱政策有效、違法、因果成立或某機關應負責。</p></section>
    <div class="grid-3"><article class="card"><h4>最小充分方法</h4><ol>${(methods.length?methods:[methodRecommendation(query).primary].filter(Boolean)).map(x=>`<li>${esc(x.name)}</li>`).join('')}</ol></article><article class="card"><h4>可檢驗學說</h4><ul>${theories.map(x=>`<li>${esc(x.name)}</li>`).join('')||'<li>先界定機制</li>'}</ul></article><article class="card"><h4>代表性文獻</h4><ul>${papers.map(x=>`<li>${esc(x.authors[0]||'')}（${esc(x.year)}）</li>`).join('')||'<li>尚無直接命中</li>'}</ul></article></div>
    <h4>來源清單</h4>${sources.length?`<div class="table-wrap"><table><thead><tr><th>ID</th><th>來源</th><th>符合原因</th><th>用途限制</th></tr></thead><tbody>${sources.map(x=>`<tr><td>${esc(x.id)}</td><td>${esc(x.title)}</td><td>${esc(x.match_reason)}</td><td>僅供定位；須開啟原文核對。</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">本地索引不足，需至官方入口或學術API查詢。</div>'}</section>`;
}

function localQuestions(data) {
  return `<section class="research-dossier"><h3>${esc(data.topic)}：分層質詢草稿</h3><ol><li>請說明目前掌握的資料期間、分母、來源、更新頻率及統計口徑。</li><li>請指出現行法源、主管權限、中央地方分工及救濟程序。</li><li>目前政策目標與可量測的結果指標為何？</li><li>曾評估哪些替代方案？不採其他方案的理由為何？</li><li>預算、人力、資訊系統及第一線執行能力是否足夠？</li><li>請說明政策成效的識別方法，如何排除景氣、人口結構或資料口徑改變等替代解釋？</li><li>請提出改善期限、主責單位、里程碑及公開檢核方式。</li></ol><p><strong>核心目標：</strong>${esc(data.goal)}</p><p><strong>已知證據：</strong>${esc(data.evidence)}</p></section>`;
}

function localParty(data) {
  const rows = (state.parties.parties || []).map(party => ({ name: party.name, date: data[`${party.id}_date`] || '', url: data[`${party.id}_url`] || '', text: data[`${party.id}_text`] || '' }));
  return `<section class="research-dossier"><h3>${esc(data.issue)}：可比性檢查</h3><div class="table-wrap"><table><thead><tr><th>政黨</th><th>日期</th><th>來源</th><th>主張</th><th>可比性</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.name)}</td><td>${esc(row.date || '缺少')}</td><td>${row.url ? `<a href="${esc(safeUrl(row.url))}" target="_blank" rel="noopener noreferrer">官方來源</a>` : '缺少'}</td><td>${esc(row.text || '缺少')}</td><td>${row.date && row.url && row.text ? '可進一步比較' : '證據不足'}</td></tr>`).join('')}</tbody></table></div><p>只有同一命題、相近條件與明確主體下的互斥主張，才可能構成實質衝突。</p></section>`;
}

function localCompare(data) {
  const countries = Array.isArray(data.countries) ? data.countries : [data.countries].filter(Boolean);
  const recommendation = methodRecommendation(data.question);
  const portals = state.sources.filter(source => countries.includes(source.country_code) && source.priority === 1).slice(0, 18);
  return `<section class="research-dossier">${methodCard(data.question)}<h3>功能比較矩陣</h3><div class="table-wrap"><table><thead><tr><th>比較維度</th><th>共同問題</th></tr></thead><tbody><tr><td>規範目的</td><td>各法域要降低什麼風險或保障什麼權利？</td></tr><tr><td>主管權限</td><td>由中央、地方、獨立機關或法院負責？</td></tr><tr><td>政策工具</td><td>法律義務、補助、價格、資訊揭露或自律？</td></tr><tr><td>程序與救濟</td><td>如何通知、聽取意見、申訴與司法審查？</td></tr><tr><td>執行與成效</td><td>資料、人力、預算、績效指標與實證效果為何？</td></tr><tr><td>可移植性</td><td>憲政、行政能力、文化與資料口徑差異為何？</td></tr></tbody></table></div><h3>核心官方入口</h3><div class="portal-grid">${portals.map(sourceCard).join('')}</div></section>`;
}

function aiPayload(task, form) {
  const data = formDataObject(form);
  const query = data.topic || data.question || data.issue || `${data.law || ''}${data.article || ''}`;
  const relevant = searchDocuments(query, 10);
  const plan = CivicSearch.planQuery(query);
  const theories = CivicAcademic.recommendTheories(state.theories, query, 6);
  const papers = CivicAcademic.searchLiterature(state.literature, query, {limit:10,minScore:3});
  const methods = CivicAcademic.recommendMethods(state.researchMethods, query, 4);
  const packet = CivicAcademic.buildEvidencePacket({question:query,documents:relevant,theories,literature:papers,methods,queryPlan:plan});
  state.lastEvidencePacket = packet;
  return { data, query, query_plan:plan, evidence_packet:packet, warning:'來源摘要只供定位；AI只能引用封包內存在的識別碼。' };
}

function callUsage() {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const usage = JSON.parse(sessionStorage.getItem('civic-ai-usage') || '{}');
    return usage.day === day ? usage : { day, count: 0 };
  } catch { return { day, count: 0 }; }
}

function bumpUsage() {
  const usage = callUsage();
  usage.count += 1;
  sessionStorage.setItem('civic-ai-usage', JSON.stringify(usage));
}

async function runAI(task, form, outputId) {
  const config = getAIConfig();
  if (!config.confirm) { location.hash = '#ai'; return; }
  if (!config.backend_url && (!config.key || !config.model)) { location.hash = '#ai'; return; }
  const usage = callUsage();
  if (usage.count >= Number(config.daily_limit || 8)) {
    document.getElementById(outputId).innerHTML = '<section class="card danger-note">已達本分頁呼叫上限。</section>';
    return;
  }
  const output = document.getElementById(outputId);
  output.className = 'output-panel';
  output.innerHTML = '<div class="loading">準備 AI 研究工作流……</div>';
  try {
    const payload = aiPayload(task, form);
    const response = await CivicAI.run({ task, payload, cfg: config, mode: config.resource_mode || 'auto', onProgress: message => { output.innerHTML = `<div class="loading">${esc(message)}</div>`; } });
    bumpUsage();
    if (task === 'legislation') {
      const fallback = CivicLegislation.buildDrafts(formDataObject(form));
      const normalized = CivicLegislation.normalizeAIResult(response.result || response, fallback);
      state.lastLegislationDraft = normalized;
      output.innerHTML = renderDraftTable(normalized);
      bindDraftActions();
    } else {
      const checked = CivicAcademic.validateResearchResult(response.result || response, payload.evidence_packet);
      output.innerHTML = renderResearchResult(checked.result, response.trace || [], checked.warnings);
    }
  } catch (error) {
    output.innerHTML = `<section class="card danger-note"><h3>AI 工作流停止</h3><p>${esc(error.message)}</p><p>沒有自動轉入付費模型。可改用規則式結果或重新檢查後端與模型。</p></section>`;
  }
}

function bindDraftActions() {
  document.getElementById('download-draft-xlsx')?.addEventListener('click', () => {
    if (!state.lastLegislationDraft) return;
    const safeName = String(state.lastLegislationDraft.title || '修法草案').replace(/[\\/:*?"<>|]/g, '_');
    CivicXLSX.downloadDraftXlsx(state.lastLegislationDraft, `${safeName}_三版本比較.xlsx`);
  });
  document.getElementById('copy-draft-json')?.addEventListener('click', () => copyText(JSON.stringify(state.lastLegislationDraft, null, 2)));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('已複製'); } catch { toast('瀏覽器未允許複製'); }
}

function toast(message) {
  let element = document.getElementById('toast');
  if (!element) { element = document.createElement('div'); element.id = 'toast'; document.body.appendChild(element); }
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 1800);
}

function bindPage() {
  document.querySelectorAll('.tabs a').forEach(link => link.classList.toggle('active', link.dataset.route === state.route));
  document.querySelectorAll('.copy-button').forEach(button => button.addEventListener('click', () => copyText(button.dataset.copy || '')));
  document.querySelectorAll('.example-chip').forEach(button => button.addEventListener('click', () => { state.query = button.dataset.query || ''; location.hash = `#home?q=${encodeURIComponent(state.query)}`; }));

  const searchForm = document.getElementById('search-form');
  searchForm?.addEventListener('submit', event => {
    event.preventDefault();
    state.query = document.getElementById('global-search').value.trim();
    location.hash = `#home${state.query ? `?q=${encodeURIComponent(state.query)}` : ''}`;
  });

  document.getElementById('research-query')?.addEventListener('click', async buttonEvent => {
    const query = buttonEvent.currentTarget.dataset.query || '';
    const pseudoForm = document.createElement('form');
    pseudoForm.innerHTML = `<input name="question" value="${esc(query)}"/><textarea name="evidence">${esc(searchDocuments(query, 8).map(item => `${item.title}: ${item.body} ${item.url || ''}`).join('\n'))}</textarea>`;
    await runAI('research', pseudoForm, 'research-query-output');
  });

  const reform = document.getElementById('reform-form');
  reform?.addEventListener('submit', event => { event.preventDefault(); document.getElementById('reform-output').className = 'output-panel'; document.getElementById('reform-output').innerHTML = localResearchPlan(formDataObject(reform)); });
  const questions = document.getElementById('question-form');
  questions?.addEventListener('submit', event => { event.preventDefault(); document.getElementById('question-output').className = 'output-panel'; document.getElementById('question-output').innerHTML = localQuestions(formDataObject(questions)); });
  const party = document.getElementById('party-form');
  party?.addEventListener('submit', event => { event.preventDefault(); document.getElementById('party-output').className = 'output-panel'; document.getElementById('party-output').innerHTML = localParty(formDataObject(party)); });
  const compare = document.getElementById('compare-form');
  compare?.addEventListener('submit', event => { event.preventDefault(); const data = formDataObject(compare); const checked = [...compare.querySelectorAll('input[name="countries"]:checked')]; if (checked.length > 5) { toast('最多5個法域'); return; } data.countries = checked.map(item => item.value); document.getElementById('method-result').innerHTML = methodCard(data.question); document.getElementById('compare-output').innerHTML = localCompare(data); });
  const draft = document.getElementById('draft-form');
  draft?.addEventListener('submit', event => { event.preventDefault(); state.lastLegislationDraft = CivicLegislation.buildDrafts(formDataObject(draft)); const output = document.getElementById('draft-output'); output.className = 'output-panel'; output.innerHTML = renderDraftTable(state.lastLegislationDraft); bindDraftActions(); });

  document.querySelectorAll('.ai-action').forEach(button => button.addEventListener('click', async () => {
    const form = document.getElementById(button.dataset.form);
    if (form) await runAI(button.dataset.task || 'research', form, button.dataset.output);
  }));


  const academicForm = document.getElementById('academic-form');
  academicForm?.addEventListener('submit', event => {
    event.preventDefault(); state.theoryQuery = document.getElementById('academic-query').value.trim(); state.theoryCategory = document.getElementById('academic-category').value; state.literatureDomain = document.getElementById('academic-domain').value.trim();
    location.hash = `#theory${state.theoryQuery?`?q=${encodeURIComponent(state.theoryQuery)}`:''}`;
  });
  const liveSearch = async source => {
    const query = document.getElementById('academic-query')?.value.trim() || state.theoryQuery;
    const status = document.getElementById('academic-live-status'); const target = document.getElementById('live-literature-results');
    if(!query){status.textContent='請先輸入研究問題或關鍵字。';return;}
    status.textContent=`正在查詢 ${source} 公開中繼資料……`; target.className='loading'; target.textContent='查詢中……';
    try {
      if(CivicAI.sensitiveText(query)) throw new Error('查詢詞可能含個人資料，已阻擋外送');
      const cfg=getAIConfig();
      const rows=cfg.backend_url
        ? await CivicAcademic.fetchBackendLiterature(cfg.backend_url,cfg.backend_token||'',query,source==='Crossref'?'crossref':'europepmc',10)
        : source==='Crossref'?await CivicAcademic.fetchCrossref(query,10):await CivicAcademic.fetchEuropePMC(query,10);
      state.liveLiterature=rows;
      target.className='';
      target.innerHTML=rows.length?rows.map(x=>literatureCard(x,true)).join(''):'<div class="empty">沒有結果。</div>';
      status.innerHTML=`<span class="status-ok">取得 ${rows.length} 筆中繼資料。相關排序與引用次數不等於研究品質。</span>`;
      target.querySelectorAll('.copy-button').forEach(button=>button.addEventListener('click',()=>copyText(button.dataset.copy||'')));
    }
    catch(error){target.className='empty';target.textContent='查詢失敗。';status.innerHTML=`<span class="status-error">${esc(error.message)}</span>`;}
  };
  document.getElementById('crossref-search')?.addEventListener('click',()=>liveSearch('Crossref'));
  document.getElementById('epmc-search')?.addEventListener('click',()=>liveSearch('Europe PMC'));
  document.getElementById('export-ris')?.addEventListener('click',()=>{const q=document.getElementById('academic-query')?.value||'';const rows=state.liveLiterature.length?state.liveLiterature:CivicAcademic.searchLiterature(state.literature,q,{limit:50,minScore:q?2:0});CivicAcademic.downloadText('civic-literature.ris',CivicAcademic.ris(rows),'application/x-research-info-systems');});
  document.getElementById('export-bib')?.addEventListener('click',()=>{const q=document.getElementById('academic-query')?.value||'';const rows=state.liveLiterature.length?state.liveLiterature:CivicAcademic.searchLiterature(state.literature,q,{limit:50,minScore:q?2:0});CivicAcademic.downloadText('civic-literature.bib',CivicAcademic.bibtex(rows),'application/x-bibtex');});

  const country = document.getElementById('source-country');
  const category = document.getElementById('source-category');
  const filter = document.getElementById('source-filter');
  const core = document.getElementById('source-core');
  const researchMode = document.getElementById('research-mode');
  const refreshSources = () => {
    state.sourceCategory = category?.value || '';
    state.sourceQuery = filter?.value || '';
    state.sourceCoreOnly = Boolean(core?.checked);
    state.citizenMode = !researchMode?.checked;
    document.body.classList.toggle('citizen-mode', state.citizenMode);
    const rows = filteredSources();
    const grid = document.getElementById('source-grid');
    if (grid) grid.innerHTML = rows.length ? rows.map(sourceCard).join('') : '<div class="empty">沒有符合條件的入口。</div>';
    const count = document.getElementById('source-count');
    if (count) count.textContent = String(rows.length);
  };
  country?.addEventListener('change', () => { state.sourceCountry = country.value; state.sourceCategory = ''; render(); });
  category?.addEventListener('change', refreshSources);
  filter?.addEventListener('input', refreshSources);
  core?.addEventListener('change', refreshSources);
  researchMode?.addEventListener('change', refreshSources);

  const aiForm = document.getElementById('ai-form');
  if (aiForm) {
    document.getElementById('discover-models')?.addEventListener('click', async () => {
      const data = formDataObject(aiForm);
      const status = document.getElementById('ai-status');
      status.textContent = '正在取得符合政策的模型清單……';
      try {
        const models = await CivicAI.fetchEligibleModels(data);
        if (!models.length) throw new Error('沒有符合條件的候選模型');
        aiForm.dataset.models = JSON.stringify(models);
        aiForm.elements.model.innerHTML = models.slice(0, 30).map(model => `<option value="${esc(model)}">${esc(model)}</option>`).join('');
        status.innerHTML = `<span class="status-ok">找到 ${models.length} 個候選。模型可用不等於永久免費；呼叫失敗時停止，不自動付款。</span>`;
      } catch (error) { status.innerHTML = `<span class="status-error">${esc(error.message)}</span>`; }
    });
    document.getElementById('test-backend')?.addEventListener('click', async () => {
      const data = formDataObject(aiForm);
      const status = document.getElementById('ai-status');
      if (!data.backend_url) { status.textContent = '請先輸入後端網址。'; return; }
      try {
        const response = await fetch(`${String(data.backend_url).replace(/\/$/, '')}/health`, { headers: data.backend_token ? { authorization: `Bearer ${data.backend_token}` } : {} });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        status.innerHTML = `<span class="status-ok">後端正常：${esc(JSON.stringify(result))}</span>`;
      } catch (error) { status.innerHTML = `<span class="status-error">後端測試失敗：${esc(error.message)}</span>`; }
    });
    aiForm.addEventListener('submit', event => {
      event.preventDefault();
      const data = formDataObject(aiForm);
      data.confirm = aiForm.elements.confirm.checked;
      if (!data.confirm) { document.getElementById('ai-status').innerHTML = '<span class="status-error">請先確認使用限制。</span>'; return; }
      data.connection = aiForm.elements.connection.value;
      data.model = aiForm.elements.model.value;
      data.candidate_models = JSON.parse(aiForm.dataset.models || '[]');
      setAIConfig(data);
      document.getElementById('ai-status').innerHTML = '<span class="status-ok">設定只保存在目前分頁。</span>';
    });
    document.getElementById('clear-ai')?.addEventListener('click', () => { sessionStorage.removeItem('civic-ai-config'); sessionStorage.removeItem('civic-ai-usage'); aiForm.reset(); document.getElementById('ai-status').textContent = '已清除。'; });
  }

  bindDraftActions();
}

function render() {
  parseHash();
  document.getElementById('app').innerHTML = pageFor(state.route);
  document.body.classList.toggle('citizen-mode', state.citizenMode);
  bindPage();
  document.getElementById('app').focus({ preventScroll: true });
}

async function loadJson(path, fallback) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status}`);
    return response.json();
  } catch (error) {
    console.warn(`無法載入 ${path}`, error);
    return fallback;
  }
}

async function init() {
  const [runtime, searchIndex, analyses, parties, theories, literature, conceptOntology, methodology, sources, jurisdictions, researchMethods, examples] = await Promise.all([
    loadJson('config/runtime.json', {}),
    loadJson('data/search-index.json', { documents: [] }),
    loadJson('data/analyses.json', []),
    loadJson('data/party_positions.json', { parties: [], comparison_rules: [] }),
    loadJson('data/theory_catalog.json', []),
    loadJson('data/literature_catalog.json', []),
    loadJson('data/concept_ontology.json', []),
    loadJson('data/methodology.json', {}),
    loadJson('data/sources.json', []),
    loadJson('data/jurisdictions.json', []),
    loadJson('data/research_methods.json', []),
    loadJson('data/curiosity_examples.json', []),
  ]);
  Object.assign(state, { runtime, searchIndex, analyses, parties, theories, literature, conceptOntology, methodology, sources, jurisdictions, researchMethods, examples });
  CivicSearch.configure(conceptOntology);
  const repo = document.getElementById('repo-link');
  if (runtime.repository_url) repo.href = safeUrl(runtime.repository_url); else repo.style.display = 'none';
  document.getElementById('build-label').textContent = runtime.build_label || '公開測試版';
  render();
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
});
const savedTheme = localStorage.getItem('theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
window.addEventListener('hashchange', render);
init();
