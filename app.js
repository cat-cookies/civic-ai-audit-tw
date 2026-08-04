'use strict';

const state = {
  runtime: {},
  searchIndex: { documents: [] },
  analyses: [],
  parties: { parties: [], comparison_rules: [] },
  theories: [],
  methodology: {},
  sources: [],
  route: 'home',
  query: '',
};

const LAW_SUFFIXES = ['法','條例','通則','規則','規程','辦法','標準','準則','細則','綱要','自治條例'];
const CN_DIGITS = { '零':0,'〇':0,'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9 };
const CN_UNITS = { '十':10,'百':100,'千':1000,'萬':10000 };
const SYNONYMS = {
  '長照': ['長期照顧','長期照護'],
  '居服': ['居家服務','居家照顧服務'],
  '法條': ['法律條文','條文'],
  '預算': ['總預算','決算','財政'],
  '質詢': ['詢答','國會監督'],
  '判決': ['裁判','裁判書'],
  '監察': ['糾正','彈劾','調查報告'],
  '政黨': ['黨團','政策主張'],
};

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function safeUrl(value) {
  try {
    const url = new URL(String(value), location.href);
    return ['http:','https:'].includes(url.protocol) ? url.href : '#';
  } catch { return '#'; }
}
function normalize(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[，。；：、！？「」『』（）()【】\[\]〈〉《》“”"'`~!@#$%^&*+=|\\/:;,.?<>_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function cnNumber(text) {
  if (/^\d+$/.test(text)) return Number(text);
  let total = 0, section = 0, number = 0;
  for (const ch of text) {
    if (Object.prototype.hasOwnProperty.call(CN_DIGITS, ch)) number = CN_DIGITS[ch];
    else if (Object.prototype.hasOwnProperty.call(CN_UNITS, ch)) {
      const unit = CN_UNITS[ch];
      if (unit === 10000) { section = (section + number) * unit; total += section; section = 0; number = 0; }
      else { if (number === 0) number = 1; section += number * unit; number = 0; }
    }
  }
  return total + section + number;
}
function routeQuery(query) {
  const raw = String(query ?? '').trim();
  if (!raw) return { mode: 'empty', raw };
  const compact = raw.replace(/\s+/g, '');
  const suffix = LAW_SUFFIXES.sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const exact = compact.match(new RegExp(`^(.+?(?:${suffix}))第([0-9零〇一二兩三四五六七八九十百千萬]+)(?:之([0-9零〇一二兩三四五六七八九十百千萬]+))?條$`));
  if (exact) {
    const article = cnNumber(exact[2]);
    const sub = exact[3] ? cnNumber(exact[3]) : null;
    return { mode:'exact_law', raw, law_name: exact[1], article, sub_article: sub, canonical: `${exact[1]}第${article}${sub ? `之${sub}` : ''}條` };
  }
  const ambiguous = compact.match(/^第([0-9零〇一二兩三四五六七八九十百千萬]+)(?:之([0-9零〇一二兩三四五六七八九十百千萬]+))?條$/);
  if (ambiguous) return { mode:'law_article_ambiguous', raw, article:cnNumber(ambiguous[1]), sub_article:ambiguous[2]?cnNumber(ambiguous[2]):null };
  if (LAW_SUFFIXES.some(s => compact.endsWith(s))) return { mode:'law_name', raw, law_name:compact };
  return { mode:'fuzzy', raw };
}
function expandTerms(query) {
  const base = normalize(query).split(' ').filter(Boolean);
  const terms = new Set(base);
  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (base.some(t => t.includes(key) || key.includes(t))) values.forEach(v => terms.add(normalize(v)));
  }
  return [...terms];
}
function bigrams(text) {
  const s = normalize(text).replace(/\s/g,'');
  const out = new Set();
  if (s.length < 2) { if (s) out.add(s); return out; }
  for (let i=0;i<s.length-1;i++) out.add(s.slice(i,i+2));
  return out;
}
function jaccard(a,b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
function rankDocument(doc, query) {
  const hay = normalize(`${doc.title || ''} ${doc.searchable || ''} ${(doc.tags || []).join(' ')}`);
  const title = normalize(doc.title || '');
  const terms = expandTerms(query);
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (title === term) score += 80;
    if (title.includes(term)) score += 30;
    if (hay.includes(term)) score += 15;
    const pieces = term.split(' ').filter(Boolean);
    score += pieces.filter(p => hay.includes(p)).length * 5;
  }
  score += jaccard(bigrams(query), bigrams(`${doc.title || ''} ${doc.body || ''}`)) * 40;
  if (doc.official) score += 4;
  if (doc.human_reviewed) score += 3;
  if (doc.publication_status === 'demonstration') score -= 1;
  return Math.max(0, Math.round(score * 10) / 10);
}
function fuzzySearch(query, limit=20) {
  return state.searchIndex.documents
    .map(doc => ({...doc, score:rankDocument(doc, query)}))
    .filter(x => x.score > 1)
    .sort((a,b) => b.score - a.score || String(a.title).localeCompare(String(b.title),'zh-Hant'))
    .slice(0, limit);
}
function kindLabel(kind) {
  return ({analysis:'分析示範',source:'官方入口',official_source:'官方入口',party:'政黨資料',theory:'理論',law_guide:'法規入口'})[kind] || kind || '資料';
}
function officialSearchLinks(parsed) {
  const term = encodeURIComponent(parsed.canonical || parsed.law_name || parsed.raw);
  return [
    ['全國法規資料庫','https://law.moj.gov.tw/'],
    ['立法院議事暨公報資訊網','https://ppg.ly.gov.tw/ppg/'],
    ['立法院法律系統','https://lis.ly.gov.tw/lglawc/lglawkm'],
    ['行政院公報資訊網','https://gazette.nat.gov.tw/'],
    ['總統府公報','https://www.president.gov.tw/Page/129'],
    ['本站模糊搜尋相關文件',`#home?q=${term}`],
  ];
}
function resultCard(doc) {
  const url = safeUrl(doc.url || '#');
  const snippet = String(doc.body || '').slice(0, 300);
  const flags = [kindLabel(doc.kind), doc.official ? '官方來源' : '', doc.evidence_grade ? `證據 ${doc.evidence_grade}` : '', doc.human_reviewed ? '已人工覆核' : (doc.publication_status ? '未完成覆核' : '')].filter(Boolean);
  return `<article class="card result-card">
    <div class="badges">${flags.map(x=>`<span class="badge">${esc(x)}</span>`).join('')}</div>
    <h3>${esc(doc.title)}</h3>
    <p>${esc(snippet)}${String(doc.body||'').length>300?'……':''}</p>
    <p class="result-score">本地搜尋分數：${esc(doc.score)}</p>
    ${url !== '#' ? `<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">開啟來源或頁面</a>` : ''}
  </article>`;
}
function renderSearchResults(query) {
  const parsed = routeQuery(query);
  if (parsed.mode === 'empty') return `<div class="empty">輸入制度、法案、機關、政策或法條名稱開始搜尋。</div>`;
  if (parsed.mode === 'exact_law') {
    const related = fuzzySearch(`${parsed.law_name} 第${parsed.article}條`, 8);
    return `<section class="card exact-law-panel">
      <div class="badges"><span class="badge">法條精確模式</span><span class="badge">不由模型猜測條次</span></div>
      <h2>${esc(parsed.canonical)}</h2>
      <p>系統已辨識法規名稱與條次。本站不內建臆測法條全文；請先由官方法規資料庫核對現行條文、沿革、公布日及施行日，再追查立法院提案、審查、協商與三讀資料。</p>
      <div class="exact-query">law_name=${esc(parsed.law_name)} · article=${esc(parsed.article)}${parsed.sub_article?` · sub_article=${esc(parsed.sub_article)}`:''}</div>
      <ul class="source-list">${officialSearchLinks(parsed).map(([n,u])=>`<li><a href="${esc(u)}" ${u.startsWith('http')?'target="_blank" rel="noopener noreferrer"':''}>${esc(n)}</a></li>`).join('')}</ul>
    </section>
    <h2>本站相關資料</h2>${related.length ? related.map(resultCard).join('') : '<div class="empty">目前索引尚無相關資料；這不代表官方資料不存在。</div>'}`;
  }
  if (parsed.mode === 'law_article_ambiguous') {
    return `<section class="card danger-note"><h2>缺少法規名稱</h2><p>「第${esc(parsed.article)}${parsed.sub_article?`之${esc(parsed.sub_article)}`:''}條」可能出現在多部法規。為避免錯引，請輸入完整格式，例如「長期照顧服務法第38條」。系統不會自行猜測法規名稱。</p></section>`;
  }
  const results = fuzzySearch(parsed.raw);
  return `<div class="search-mode"><span class="badge">${parsed.mode==='law_name'?'法規名稱搜尋':'關鍵字模糊搜尋'}</span><span>${esc(results.length)} 筆相關結果</span></div>
  ${results.length ? results.map(resultCard).join('') : '<div class="empty">沒有找到高相關結果。可改用完整法規名稱、機關名稱或較短的政策關鍵字。</div>'}`;
}
function searchShell(query='') {
  return `<section class="search-shell">
    <form id="search-form" class="search-row">
      <input id="global-search" name="q" value="${esc(query)}" autocomplete="off" placeholder="例如：長照 未應門、預算執行、老人福利法第48條" aria-label="搜尋國家資料" />
      <button class="primary" type="submit">搜尋</button>
    </form>
    <p class="search-hint">一般文字採本地模糊排序；完整「法規名稱＋第○條」採精確解析。模型不參與初始搜尋排序。</p>
  </section>`;
}
function homePage() {
  return `${searchShell(state.query)}
  <div id="search-results">${renderSearchResults(state.query)}</div>
  <section class="grid-3">
    <article class="card"><div class="kpi">${esc(state.sources.length)}</div><h3>官方資料入口</h3><p>跨五院、公報、法規、預算、審計、採購、檔案與研究資料。</p></article>
    <article class="card"><div class="kpi">${esc(state.searchIndex.document_count || state.searchIndex.documents.length)}</div><h3>本地索引文件</h3><p>搜尋先行，無需模型金鑰；索引可由 GitHub Actions 重建。</p></article>
    <article class="card"><div class="kpi">6</div><h3>主要模型呼叫上限</h3><p>依風險採 3／4／6 階段，不把模型投票當成證據。</p></article>
  </section>`;
}
function analysisCard(a, questionsOnly=false) {
  const sources = (a.sources||[]).map(s=>`<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="muted">${esc(s.date||'')}</span></li>`).join('');
  if (questionsOnly) return `<article class="card analysis-card"><div class="badges"><span class="badge">${esc(a.domain)}</span><span class="badge">${a.human_reviewed?'已覆核':'示範未覆核'}</span></div><h3>${esc(a.title)}</h3><ol>${(a.question_targets||[]).map(q=>`<li>${esc(q)}</li>`).join('')}</ol><details><summary>證據與限制</summary><p>${esc(a.summary)}</p><p>${esc(a.limitations)}</p><ul>${sources}</ul></details></article>`;
  return `<article class="card analysis-card"><div class="badges"><span class="badge">${esc(a.domain)}</span><span class="badge grade-${esc(a.evidence_grade)}">證據 ${esc(a.evidence_grade)}</span><span class="badge">${a.human_reviewed?'已人工覆核':'AI 示範／未覆核'}</span></div><h3>${esc(a.title)}</h3><p><strong>資料顯示：</strong>${esc(a.summary)}</p><p><strong>可能的制度檢討需求：</strong>${esc(a.reform_need)}</p><div class="grid-2"><div class="claim"><strong>政策形成：</strong>${esc(a.legal_policy_split?.policy)}</div><div class="claim"><strong>法律形成：</strong>${esc(a.legal_policy_split?.law)}</div></div><details><summary>理論比較、來源與限制</summary>${(a.theory_comparison||[]).map(t=>`<p><strong>${esc(t.theory)}：</strong>${esc(t.assessment)}</p>`).join('')}<ul>${sources}</ul><p>${esc(a.limitations)}</p></details></article>`;
}
function reformPage() { return `<h2>國家改革雷達</h2><section class="card notice"><p>此處呈現的是可能的制度檢討需求，不是「政府失靈」或「必須改革」的自動判決。指標、權重、替代解釋與資料限制應公開。</p></section>${state.analyses.map(a=>analysisCard(a)).join('')}`; }
function questionsPage() { return `<h2>立法委員質詢題庫</h2><section class="card notice"><p>問題應由官方資料導出，區分事實確認、政策選擇、法律依據、預算執行與責任追蹤，不預設被詢答機關已違法或失職。</p></section>${state.analyses.map(a=>analysisCard(a,true)).join('')}`; }
function partiesPage() {
  return `<h2>政黨政策立場一致性與變動分析</h2><section class="card notice"><p>${esc(state.parties.notice)}</p><p>判斷狀態：立場一致、手段調整、有條件差異、發言主體不同、政策層級不同、立場明確變更、表面不一致尚待釐清、實質衝突、證據不足。</p></section><div class="grid-3">${(state.parties.parties||[]).map(p=>`<article class="card party-column"><h3>${esc(p.name)}</h3><p><a href="${esc(safeUrl(p.official_url))}" target="_blank" rel="noopener noreferrer">官方網站</a></p><p>${p.positions?.length ? `${esc(p.positions.length)} 筆已登錄主張` : '尚未匯入可比較且已核對日期、主體與原文的正式主張。'}</p></article>`).join('')}</div><h3>比較規則</h3><ul>${(state.parties.comparison_rules||[]).map(x=>`<li>${esc(x.replace('所謂矛盾','所謂實質衝突'))}</li>`).join('')}</ul>`;
}
function theoryPage() { return `<h2>現實制度與教科書／學說比較</h2><section class="card notice"><p>理論不是直接證明制度優劣的事實證據。比較時應先說明價值前提、適用範圍、反例與制度限制。</p></section><div class="grid-3">${state.theories.map(t=>`<article class="card"><div class="badge">${esc(t.category)}</div><h3>${esc(t.name)}</h3><p>${esc(t.question)}</p></article>`).join('')}</div>`; }
function legislationPage() {
  return `<h2>修法與立法理由草案產生器</h2><section class="card danger-note"><p>輸出只是假設性草案，不是正式議案關係文書、現行法律或法律意見。送出前必須查核現行法、主管機關權限、財政影響、程序保障與用語一致性。</p></section>
  <form id="draft-form" class="form-grid card">
    <label>法規名稱<input name="law" required placeholder="例如：老人福利法" /></label>
    <label>條次<input name="article" required placeholder="例如：第四十八條" /></label>
    <label class="full">制度問題<textarea name="problem" required placeholder="具體描述現行制度、證據與不能過度推論之處"></textarea></label>
    <label class="full">政策目的<textarea name="goal" required placeholder="說明欲改善的公共問題與替代方案比較"></textarea></label>
    <label class="full">擬修正方向<textarea name="change" required placeholder="說明權利義務、主管機關、程序與法律效果"></textarea></label>
    <div class="full"><button class="primary" type="submit">產生結構化草稿</button></div>
  </form><pre id="draft-output" class="output-box">尚未產生草稿。</pre>`;
}
function sourcesPage() {
  const cats = [...new Set(state.sources.map(s=>s.category))];
  return `<h2>國家資料與政府文檔查詢入口</h2><div class="toolbar"><input id="source-filter" placeholder="篩選機關、資料或用途"/><select id="source-category"><option value="">全部院別／類別</option>${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div id="source-table">${sourceTable(state.sources)}</div>`;
}
function sourceTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th>類別／機關</th><th>入口</th><th>主要用途</th><th>限制</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.category)}<br><span class="muted">${esc(s.agency)}</span></td><td><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a><div class="badges"><span class="badge">${esc(s.level)}</span></div></td><td>${esc(s.data)}<br><strong>適合：</strong>${esc(s.best_for)}</td><td>${esc(s.limitations)}</td></tr>`).join('')}</tbody></table></div>`;
}
function methodPage() {
  return `<h2>查證方法、模型互評與法律風險控制</h2><section class="grid-2"><article class="card"><h3>證據等級</h3>${Object.entries(state.methodology.evidence_grades||{}).map(([k,v])=>`<p><span class="badge grade-${esc(k)}">${esc(k)}</span> ${esc(v)}</p>`).join('')}</article><article class="card"><h3>模型治理</h3><p>模型供應商須即時發現可用模型，只有「價格為零、供應商在白名單、資料政策合格、免費狀態未過期」者可自動替換。任何條件不明即停止，不得自動轉付費。</p><p>多模型一致不等於事實正確；每項結論仍須對應官方原文、日期、效力與人工審核。</p></article></section><h3>處理流程</h3><ol>${(state.methodology.pipeline||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ol><h3>發布規則</h3><ul>${(state.methodology.publication_rules||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
}
function pageFor(route) {
  return ({home:homePage,reform:reformPage,questions:questionsPage,parties:partiesPage,theory:theoryPage,legislation:legislationPage,sources:sourcesPage,method:methodPage}[route] || homePage)();
}
function setRouteFromHash() {
  const hash = location.hash.replace(/^#/,'');
  const [routePart, queryPart] = hash.split('?');
  state.route = ['home','reform','questions','parties','theory','legislation','sources','method'].includes(routePart) ? routePart : 'home';
  const params = new URLSearchParams(queryPart || '');
  if (params.has('q')) state.query = params.get('q') || '';
}
function bindPage() {
  document.querySelectorAll('.tabs a').forEach(a=>a.classList.toggle('active',a.dataset.route===state.route));
  const form = document.getElementById('search-form');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    state.query = document.getElementById('global-search').value.trim();
    history.replaceState(null,'',`#home${state.query?`?q=${encodeURIComponent(state.query)}`:''}`);
    document.getElementById('search-results').innerHTML = renderSearchResults(state.query);
  });
  const draft = document.getElementById('draft-form');
  if (draft) draft.addEventListener('submit', e => {
    e.preventDefault(); const fd = new FormData(draft);
    const law=fd.get('law'), article=fd.get('article'), problem=fd.get('problem'), goal=fd.get('goal'), change=fd.get('change');
    const out = `【人工智慧生成草稿／須查核現行法】\n\n案由：本院○○，鑑於${problem}。為${goal}，爰擬具「${law}${article}條文修正草案」。是否有當？敬請公決。\n\n${law}${article}條文修正草案對照表\n\n修正條文：\n［請依現行法逐字比對後填入］\n\n現行條文：\n［請自全國法規資料庫核對公布、施行與沿革後貼入］\n\n說明：\n一、制度問題：${problem}\n二、政策目的：${goal}\n三、修正方向：${change}\n四、尚須完成：憲法與法律保留檢查、主管機關權限、法規影響評估、財政與人權影響、程序救濟、執行能力及相關法規一致性。`;
    document.getElementById('draft-output').textContent = out;
  });
  const sf = document.getElementById('source-filter'), sc=document.getElementById('source-category');
  const applySource = () => {
    if (!sf || !sc) return;
    const q=normalize(sf.value), cat=sc.value;
    const rows=state.sources.filter(s=>(!cat||s.category===cat)&&(!q||normalize(Object.values(s).join(' ')).includes(q)));
    document.getElementById('source-table').innerHTML=sourceTable(rows);
  };
  sf?.addEventListener('input',applySource); sc?.addEventListener('change',applySource);
}
function render() {
  setRouteFromHash();
  document.getElementById('app').innerHTML = pageFor(state.route);
  bindPage();
  document.getElementById('app').focus({preventScroll:true});
}
async function loadJson(path, fallback) {
  try { const r=await fetch(path,{cache:'no-store'}); if(!r.ok) throw new Error(`${r.status}`); return await r.json(); }
  catch(e) { console.warn(`無法載入 ${path}`,e); return fallback; }
}
async function init() {
  const [runtime,index,analyses,parties,theories,method,sources] = await Promise.all([
    loadJson('config/runtime.json',{}), loadJson('data/search-index.json',{documents:[]}), loadJson('data/analyses.json',[]),
    loadJson('data/party_positions.json',{parties:[],comparison_rules:[]}), loadJson('data/theory_catalog.json',[]),
    loadJson('data/methodology.json',{}), loadJson('data/sources.json',[])
  ]);
  Object.assign(state,{runtime,searchIndex:index,analyses,parties,theories,methodology:method,sources});
  const repo=document.getElementById('repo-link');
  if (runtime.repository_url) repo.href=safeUrl(runtime.repository_url); else repo.style.display='none';
  document.getElementById('build-label').textContent=runtime.build_label||'可部署暨待整合驗證 MVP';
  render();
}
document.getElementById('theme-toggle').addEventListener('click',()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=next; localStorage.setItem('theme',next);
});
const saved=localStorage.getItem('theme'); if(saved) document.documentElement.dataset.theme=saved;
window.addEventListener('hashchange',render);
init();
