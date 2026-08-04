'use strict';

const state = {
  runtime: {}, searchIndex: { documents: [] }, analyses: [], parties: { parties: [], comparison_rules: [] },
  theories: [], methodology: {}, sources: [], jurisdictions: [], researchMethods: [],
  route: 'home', params: new URLSearchParams(), query: '',
  sourceCountry: 'TW', sourceCategory: '', sourceQuery: '', sourceCoreOnly: true,
};

const LAW_SUFFIXES = ['自治條例','施行細則','條例','通則','規則','規程','辦法','標準','準則','細則','綱要','法'];
const CN_DIGITS = {'零':0,'〇':0,'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
const CN_UNITS = {'十':10,'百':100,'千':1000,'萬':10000};
const SYNONYMS = {
  '長照':['長期照顧','長期照護'], '居服':['居家服務','居家照顧服務'], '法條':['法律條文','條文'],
  '預算':['總預算','決算','財政'], '質詢':['詢答','國會監督'], '判決':['裁判','裁判書'],
  '監察':['糾正','彈劾','調查報告'], '政黨':['黨團','政策主張'], '改革':['制度檢討','政策改善'],
};
const BLOCKED_MODEL_PREFIXES = ['deepseek/','qwen/','z-ai/','moonshotai/','minimax/','baidu/','tencent/','01-ai/','thudm/','stepfun/'];
const ALLOWED_MODEL_PREFIXES = ['google/','meta-llama/','mistralai/','openai/','nvidia/','microsoft/','cohere/','ai21/'];

function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function safeUrl(value) { try { const u = new URL(String(value), location.href); return ['http:','https:'].includes(u.protocol) ? u.href : '#'; } catch { return '#'; } }
function normalize(text) { return String(text ?? '').normalize('NFKC').toLowerCase().replace(/[，。；：、！？「」『』（）()【】\[\]〈〉《》“”"'`~!@#$%^&*+=|\\/:;,.?<>_-]+/g,' ').replace(/\s+/g,' ').trim(); }
function compactText(value) { return String(value ?? '').replace(/\s+/g,' ').trim(); }
function cnNumber(text) {
  if (/^\d+$/.test(text)) return Number(text); let total=0, section=0, number=0;
  for (const ch of text) { if (ch in CN_DIGITS) number=CN_DIGITS[ch]; else if (ch in CN_UNITS) { const unit=CN_UNITS[ch]; if(unit===10000){section=(section+number)*unit;total+=section;section=0;number=0;}else{if(number===0)number=1;section+=number*unit;number=0;} } }
  return total+section+number;
}
function parseHash() {
  const raw = location.hash.replace(/^#/,'') || 'home'; const qpos=raw.indexOf('?');
  const route=qpos>=0?raw.slice(0,qpos):raw; const params=new URLSearchParams(qpos>=0?raw.slice(qpos+1):'');
  state.route=['home','reform','questions','parties','compare','legislation','sources','ai'].includes(route)?route:'home'; state.params=params;
  if(params.has('q')) state.query=params.get('q')||'';
}
function routeQuery(query) {
  const raw=String(query??'').trim(); if(!raw)return{mode:'empty',raw}; const compact=raw.replace(/\s+/g,'');
  const suffix=LAW_SUFFIXES.sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const exact=compact.match(new RegExp(`^(.+?(?:${suffix}))第([0-9零〇一二兩三四五六七八九十百千萬]+)(?:之([0-9零〇一二兩三四五六七八九十百千萬]+))?條$`));
  if(exact){const article=cnNumber(exact[2]),sub=exact[3]?cnNumber(exact[3]):null;return{mode:'exact_law',raw,law_name:exact[1],article,sub_article:sub,canonical:`${exact[1]}第${article}${sub?`之${sub}`:''}條`};}
  const ambiguous=compact.match(/^第([0-9零〇一二兩三四五六七八九十百千萬]+)(?:之([0-9零〇一二兩三四五六七八九十百千萬]+))?條$/);
  if(ambiguous)return{mode:'law_article_ambiguous',raw,article:cnNumber(ambiguous[1]),sub_article:ambiguous[2]?cnNumber(ambiguous[2]):null};
  if(LAW_SUFFIXES.some(s=>compact.endsWith(s)))return{mode:'law_name',raw,law_name:compact}; return{mode:'fuzzy',raw};
}
function expandTerms(query){const base=normalize(query).split(' ').filter(Boolean),terms=new Set(base);for(const [k,vals] of Object.entries(SYNONYMS)){if(base.some(t=>t.includes(k)||k.includes(t)))vals.forEach(v=>terms.add(normalize(v)));}return[...terms];}
function bigrams(text){const s=normalize(text).replace(/\s/g,''),out=new Set();if(s.length<2){if(s)out.add(s);return out;}for(let i=0;i<s.length-1;i++)out.add(s.slice(i,i+2));return out;}
function jaccard(a,b){if(!a.size||!b.size)return 0;let inter=0;for(const x of a)if(b.has(x))inter++;return inter/(a.size+b.size-inter);}
function rankDocument(doc,query){const hay=normalize(`${doc.title||''} ${doc.searchable||''} ${(doc.tags||[]).join(' ')}`),title=normalize(doc.title||''),terms=expandTerms(query);let score=0;for(const term of terms){if(!term)continue;if(title===term)score+=80;if(title.includes(term))score+=30;if(hay.includes(term))score+=15;score+=term.split(' ').filter(Boolean).filter(p=>hay.includes(p)).length*5;}score+=jaccard(bigrams(query),bigrams(`${doc.title||''} ${doc.body||''}`))*40;if(doc.official)score+=4;if(doc.human_reviewed)score+=3;return Math.max(0,Math.round(score*10)/10);}
function fuzzySearch(query,limit=20){return state.searchIndex.documents.map(d=>({...d,score:rankDocument(d,query)})).filter(x=>x.score>1).sort((a,b)=>b.score-a.score||String(a.title).localeCompare(String(b.title),'zh-Hant')).slice(0,limit);}
function kindLabel(kind){return({analysis:'制度分析',official_source:'官方入口',party_position:'政黨資料',theory:'理論',law_guide:'法規入口',research_method:'研究方法'})[kind]||kind||'資料';}
function internalLink(url){return String(url||'').startsWith('#');}
function resultCard(doc){
  const raw=String(doc.url||'#'),internal=internalLink(raw),url=internal?raw:safeUrl(raw),snippet=String(doc.body||'').slice(0,260);
  const flags=[kindLabel(doc.kind),doc.country||'',doc.official?'官方來源':'',doc.evidence_grade?`證據 ${doc.evidence_grade}`:'',doc.human_reviewed?'已人工覆核':''].filter(Boolean);
  return `<article class="card result-card"><div class="badges">${flags.map(x=>`<span class="badge">${esc(x)}</span>`).join('')}</div><h3>${esc(doc.title)}</h3><p>${esc(snippet)}${String(doc.body||'').length>260?'……':''}</p><p class="result-score">本地搜尋分數：${esc(doc.score)}</p>${url!=='#'?`<a class="source-link" href="${esc(url)}" ${internal?'':'target="_blank" rel="noopener noreferrer"'}>${internal?'在本站查看':'開啟官方來源'}</a>`:''}</article>`;
}
function siteSearchUrl(domain,query){return `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} ${query}`)}`;}
function exactLawPanel(parsed){
  const q=parsed.canonical,ppg=`https://ppg.ly.gov.tw/ppg/bills/search?criteria=keyword&value=${encodeURIComponent(parsed.law_name)}`;
  const lawSite=siteSearchUrl('law.moj.gov.tw',q),lySite=siteSearchUrl('lis.ly.gov.tw',q),judSite=siteSearchUrl('judgment.judicial.gov.tw',q);
  return `<section class="card exact-law-panel"><div class="badges"><span class="badge">法條精確模式</span><span class="badge">不由模型猜測條次</span></div><h2>${esc(q)}</h2><p>已辨識法規名稱與條次。請依序核對現行條文、沿革、立法歷程、裁判適用與施行日期；搜尋引擎連結只用於定位官方頁面，不能取代官方原文。</p><div class="exact-query">law_name=${esc(parsed.law_name)} · article=${esc(parsed.article)}${parsed.sub_article?` · sub_article=${esc(parsed.sub_article)}`:''}</div><div class="action-row">
  <a class="primary" href="${esc(lawSite)}" target="_blank" rel="noopener noreferrer">搜尋全國法規資料庫官方頁面</a>
  <a class="secondary" href="${esc(ppg)}" target="_blank" rel="noopener noreferrer">直接搜尋立法院議案</a>
  <a class="secondary" href="${esc(lySite)}" target="_blank" rel="noopener noreferrer">搜尋立法院法律系統</a>
  <a class="secondary" href="${esc(judSite)}" target="_blank" rel="noopener noreferrer">搜尋司法院裁判</a>
  <button class="secondary copy-button" type="button" data-copy="${esc(q)}">複製查詢詞</button>
  </div></section>`;
}
function renderSearchResults(query){
  const parsed=routeQuery(query);if(parsed.mode==='empty')return`<div class="empty">輸入制度、法案、機關、政策或完整法條開始搜尋。</div>`;
  if(parsed.mode==='exact_law'){const related=fuzzySearch(`${parsed.law_name} 第${parsed.article}條`,8);return`${exactLawPanel(parsed)}<h2>本站相關資料</h2>${related.length?related.map(resultCard).join(''):'<div class="empty">索引尚無相關資料；這不代表官方資料不存在。</div>'}`;}
  if(parsed.mode==='law_article_ambiguous')return`<section class="card danger-note"><h2>缺少法規名稱</h2><p>「第${esc(parsed.article)}${parsed.sub_article?`之${esc(parsed.sub_article)}`:''}條」可能出現在多部法規。請輸入完整格式，例如「長期照顧服務法第38條」。</p></section>`;
  const results=fuzzySearch(parsed.raw);return`<div class="search-mode"><span class="badge">${parsed.mode==='law_name'?'法規名稱搜尋':'關鍵字模糊搜尋'}</span><span>${esc(results.length)} 筆相關結果</span></div>${results.length?results.map(resultCard).join(''):'<div class="empty">沒有找到高相關結果。可改用完整法規名稱、機關名稱或較短的政策關鍵字。</div>'}`;
}
function searchShell(query=''){return`<section class="search-shell"><form id="search-form" class="search-row"><input id="global-search" name="q" value="${esc(query)}" autocomplete="off" placeholder="例如：長照 未應門、國會改革、老人福利法第48條" aria-label="搜尋國家資料"/><button class="primary" type="submit">搜尋</button></form><p class="search-hint">搜尋先行、AI 後置。一般文字採本地模糊排序；完整法條採精確解析。搜尋結果可再交由你設定的 AI Key 潤稿，但模型不得取代官方證據。</p></section>`;}

function homePage(){return`${searchShell(state.query)}<section id="search-results">${renderSearchResults(state.query)}</section><section class="grid-4"><article class="card"><div class="kpi">${esc(state.sources.length)}</div><h3>多國官方入口</h3><p>先選國家，再依法規、立法、司法、統計、審計等類別查找。</p></article><article class="card"><div class="kpi">${esc(state.jurisdictions.length)}</div><h3>比較法域</h3><p>中華民國為基準，並納入美、英、加、澳、紐、日、韓、新加坡、歐盟及國際組織。</p></article><article class="card"><div class="kpi">${esc(state.researchMethods.length)}</div><h3>研究方法引擎</h3><p>依問題自動推薦法釋義、比較法、因果推論、執行研究或安全科學。</p></article><article class="card"><div class="kpi">BYOK</div><h3>自備 AI Key</h3><p>可選 OpenRouter 零價格模型、Gemini 或 Groq；未知或額度不足即停止，不自動轉付費。</p></article></section>`;}
function analysisCard(a,questionsOnly=false){
  const id=`analysis-${a.id}`,highlight=state.params.get('id')===a.id?' highlight':'';const sources=(a.sources||[]).map(s=>`<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="muted">${esc(s.date||'')}</span></li>`).join('');
  if(questionsOnly)return`<article id="${esc(id)}" class="card analysis-card${highlight}"><div class="badges"><span class="badge">${esc(a.domain)}</span><span class="badge">${a.human_reviewed?'已覆核':'示範未覆核'}</span></div><h3>${esc(a.title)}</h3><ol>${(a.question_targets||[]).map(q=>`<li>${esc(q)}</li>`).join('')}</ol><details><summary>證據與限制</summary><p>${esc(a.summary)}</p><p>${esc(a.limitations)}</p><ul>${sources}</ul></details></article>`;
  return`<article id="${esc(id)}" class="card analysis-card${highlight}"><div class="badges"><span class="badge">${esc(a.domain)}</span><span class="badge grade-${esc(a.evidence_grade)}">證據 ${esc(a.evidence_grade)}</span><span class="badge">${a.human_reviewed?'已人工覆核':'AI 示範／未覆核'}</span></div><h3>${esc(a.title)}</h3><p><strong>資料顯示：</strong>${esc(a.summary)}</p><p><strong>可能的制度檢討需求：</strong>${esc(a.reform_need)}</p><div class="grid-2"><div class="claim"><strong>政策形成：</strong>${esc(a.legal_policy_split?.policy)}</div><div class="claim"><strong>法律形成：</strong>${esc(a.legal_policy_split?.law)}</div></div><details><summary>理論比較、來源與限制</summary>${(a.theory_comparison||[]).map(t=>`<p><strong>${esc(t.theory)}：</strong>${esc(t.assessment)}</p>`).join('')}<ul>${sources}</ul><p>${esc(a.limitations)}</p></details></article>`;
}
function reformPage(){return`<h2>國家改革分析</h2><section class="card notice"><p>「需要改革」屬規範判斷。本站先分開事實、法律、政策、執行與價值判斷，並強制列出替代解釋與不能證明的事項。</p></section><form id="reform-form" class="form-grid card"><label>議題<input name="topic" required placeholder="例如：居家服務未應門安全閉環"/></label><label>主要機關<input name="agency" placeholder="例如：衛生福利部、地方政府"/></label><label class="full">已知官方資料或觀察<textarea name="evidence" required placeholder="貼上可查證的資料、統計或官方文件摘要；不要貼個資"></textarea></label><label class="full">現行制度或法律<textarea name="current" placeholder="目前規範、流程與責任分工"></textarea></label><label class="full">希望改善的問題<textarea name="goal" required placeholder="說明公共問題，不要先預設誰違法或失職"></textarea></label><div class="full action-row"><button class="primary" type="submit">產生本地改革分析</button><button class="secondary ai-action" type="button" data-purpose="reform">用我的 AI Key 潤稿</button></div></form><pre id="reform-output" class="output-box markdown-output">尚未產生分析。</pre><h2>既有示範</h2>${state.analyses.map(a=>analysisCard(a)).join('')}`;}
function questionsPage(){return`<h2>立法委員質詢題庫</h2><section class="card notice"><p>質詢應由官方資料導出，依「事實確認、法源、政策選擇、預算執行、責任與改善期限」分層，不預設被詢答機關已違法或失職。</p></section><form id="question-form" class="form-grid card"><label>議題<input name="topic" required/></label><label>被詢答機關<input name="agency" required/></label><label class="full">官方資料與已知缺口<textarea name="evidence" required></textarea></label><label class="full">希望問出的核心答案<textarea name="goal" required></textarea></label><div class="full action-row"><button class="primary" type="submit">產生分層質詢</button><button class="secondary ai-action" type="button" data-purpose="questions">用我的 AI Key 潤稿</button></div></form><pre id="question-output" class="output-box markdown-output">尚未產生題庫。</pre><h2>既有示範</h2>${state.analyses.map(a=>analysisCard(a,true)).join('')}`;}
function partiesPage(){
  const parties=state.parties.parties||[];return`<h2>政黨政策立場一致性與變動分析</h2><section class="card notice"><p>政府事實資料與政黨主張分庫。只有同一議題、同一主體、日期、文件層級、條件與完整原文對齊後，才可討論實質衝突；個別委員發言不得直接替代政黨正式立場。</p></section><form id="party-form" class="form-grid card"><label class="full">比較議題<input name="issue" required placeholder="例如：長照財源、國會改革、能源政策"/></label>${parties.map(p=>`<fieldset class="card"><legend>${esc(p.name)}</legend><label>日期<input name="${esc(p.id)}_date" type="date"/></label><label>官方來源網址<input name="${esc(p.id)}_url" type="url" placeholder="官方黨網、正式提案或原始發言"/></label><label>正式主張全文或摘要<textarea name="${esc(p.id)}_text" class="compact-textarea"></textarea></label></fieldset>`).join('')}<div class="full action-row"><button class="primary" type="submit">檢查可比性與一致性</button><button class="secondary ai-action" type="button" data-purpose="parties">用我的 AI Key 比較</button></div></form><pre id="party-output" class="output-box markdown-output">尚未輸入可比較資料。</pre><div class="grid-3">${parties.map(p=>`<article class="card party-column"><h3>${esc(p.name)}</h3><p><a href="${esc(safeUrl(p.official_url))}" target="_blank" rel="noopener noreferrer">官方網站</a></p><p>${p.positions?.length?`${esc(p.positions.length)} 筆已登錄主張`:'尚未匯入經日期、主體與原文核對的正式主張。'}</p></article>`).join('')}</div>`;
}
function methodRecommendation(question){
  const n=normalize(question),scores=state.researchMethods.map(m=>({m,score:(m.triggers||[]).reduce((s,t)=>s+(n.includes(normalize(t))?3:0),0)})).sort((a,b)=>b.score-a.score);let primary=scores[0];if(!primary||primary.score===0)primary={m:state.researchMethods.find(m=>m.id==='implementation')||state.researchMethods[0],score:0};const supplemental=scores.filter(x=>x.m.id!==primary.m.id&&x.score>0).slice(0,2).map(x=>x.m);return{primary:primary.m,supplemental};
}
function methodResultHtml(question){const rec=methodRecommendation(question),m=rec.primary;return`<article class="card method-card"><div class="badge">主要方法</div><h3>${esc(m.name)}</h3><p><strong>為何適合：</strong>${esc(m.why)}</p><ol>${(m.steps||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ol><p><strong>限制：</strong>${esc(m.caveat)}</p>${rec.supplemental.length?`<p><strong>補充方法：</strong>${rec.supplemental.map(x=>esc(x.name)).join('、')}</p>`:''}</article>`;}
function comparePage(){
  const checks=state.jurisdictions.filter(j=>j.code!=='INT').map(j=>`<label><input type="checkbox" name="countries" value="${esc(j.code)}" ${['TW','UK','EU'].includes(j.code)?'checked':''}/><span>${esc(j.name)}</span></label>`).join('');
  return`<h2>跨國比較與研究方法</h2><section class="card notice"><p>中華民國是分析基準，但不封閉於單一法域。跨國比較採「相同功能問題、相同分析問題、不同制度背景」的功能比較法，並檢查制度移植限制。</p></section><div class="split-pane"><form id="compare-form" class="card mini-form sticky-card"><label>研究／改革問題<textarea name="question" required placeholder="例如：各國如何處理居家照顧服務未應門後的安全確認與責任移交？"></textarea></label><label>比較重點<select name="category"><option value="">自動判斷</option>${[...new Set(state.sources.map(s=>s.portal_category))].sort().map(c=>`<option>${esc(c)}</option>`).join('')}</select></label><div><strong>選擇法域（最多 5 個）</strong><div class="checkbox-grid">${checks}</div></div><label>已知可用資料<input name="available" placeholder="例如：法規、行政資料、年度統計、訪談"/></label><div class="action-row"><button class="primary" type="submit">產生比較研究路徑</button><button class="secondary ai-action" type="button" data-purpose="compare">用我的 AI Key 潤稿</button></div></form><section><div id="method-result" class="empty">輸入問題後，系統會自動推薦研究方法與各國官方入口。</div><div id="compare-output"></div></section></div>`;
}
function legislationPage(){return`<h2>修法與立法理由草案產生器</h2><section class="card danger-note"><p>輸出只是假設性草稿，不是正式議案關係文書、現行法律或法律意見。若未提供現行條文，系統不會捏造條文；應另行核對法源、主管機關、財政影響、程序保障與相關法規一致性。</p></section><form id="draft-form" class="form-grid card"><label>法規名稱<input name="law" required placeholder="例如：老人福利法"/></label><label>條次<input name="article" required placeholder="例如：第四十八條"/></label><label class="full">現行條文（建議貼入）<textarea name="current_text" placeholder="未貼入時，只產生修法方向與理由，不生成虛構條文"></textarea></label><label class="full">制度問題與證據<textarea name="problem" required placeholder="具體描述現行制度、證據與不能過度推論之處"></textarea></label><label class="full">政策目的<textarea name="goal" required placeholder="說明公共問題、受影響群體與替代方案"></textarea></label><label class="full">擬修正方向<textarea name="change" required placeholder="說明權利義務、主管機關、程序、期限與法律效果"></textarea></label><label class="full">官方來源網址（每行一個）<textarea name="sources" class="compact-textarea" placeholder="https://..."></textarea></label><div class="full action-row"><button class="primary" type="submit">產生本地潤稿草案</button><button class="secondary ai-action" type="button" data-purpose="legislation">用我的 AI Key 深度潤稿</button><button class="secondary copy-output" type="button" data-target="draft-output">複製草稿</button></div></form><pre id="draft-output" class="output-box markdown-output">尚未產生草稿。</pre>`;}
function countryOptions(selected){return state.jurisdictions.map(j=>`<option value="${esc(j.code)}" ${j.code===selected?'selected':''}>${esc(j.name)}</option>`).join('');}
function sourceCard(s,query=''){
  const search=s.search_template&&query?s.search_template.replace('{query}',encodeURIComponent(query)):'';return`<article id="source-${esc(s.id)}" class="card portal-card"><div class="badges"><span class="badge">${esc(s.portal_category)}</span><span class="badge">${esc(s.level)}</span></div><h3>${esc(s.name)}</h3><div class="portal-meta">${esc(s.country)} · ${esc(s.agency)}</div><p>${esc(s.data)}</p><p><strong>適合：</strong>${esc(s.best_for)}</p><div class="source-actions"><a class="primary" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">開啟官方入口</a>${search?`<a class="secondary" href="${esc(search)}" target="_blank" rel="noopener noreferrer">以目前關鍵字搜尋</a>`:''}${query?`<button class="secondary copy-button" type="button" data-copy="${esc(query)}">複製關鍵字</button>`:''}</div><details><summary>使用限制</summary><p>${esc(s.limitations)}</p></details></article>`;}
function filteredSources(){const q=normalize(state.sourceQuery);return state.sources.filter(s=>(!state.sourceCountry||s.country_code===state.sourceCountry)&&(!state.sourceCategory||s.portal_category===state.sourceCategory)&&(!state.sourceCoreOnly||s.priority===1)&&(!q||normalize(`${s.name} ${s.agency} ${s.data} ${s.best_for} ${s.portal_category}`).includes(q))).sort((a,b)=>a.priority-b.priority||a.portal_category.localeCompare(b.portal_category,'zh-Hant')||a.name.localeCompare(b.name,'zh-Hant'));}
function sourcesPage(){
  const selected=state.params.get('country')||state.sourceCountry;state.sourceCountry=selected;const categories=[...new Set(state.sources.filter(s=>!selected||s.country_code===selected).map(s=>s.portal_category))].sort();const rows=filteredSources();
  return`<h2>國家資料與政府文檔查詢入口</h2><section class="card notice"><p>先選國家，再選資料類別。預設只顯示研究與查證最常用的核心入口；需要時可展開完整清單。卡片只保留「能查什麼、適合什麼、官方連結」，其他限制收在細節中。</p></section><div class="toolbar"><select id="source-country">${countryOptions(selected)}</select><select id="source-category"><option value="">全部類別</option>${categories.map(c=>`<option ${c===state.sourceCategory?'selected':''}>${esc(c)}</option>`).join('')}</select><input id="source-filter" value="${esc(state.sourceQuery)}" placeholder="輸入議題、機關或資料用途"/><label class="pill-button"><input id="source-core" type="checkbox" ${state.sourceCoreOnly?'checked':''}/> 只顯示核心入口</label></div><p><strong id="source-count">${esc(rows.length)}</strong> 個符合條件的官方入口</p><div id="source-grid" class="portal-grid">${rows.length?rows.map(s=>sourceCard(s,state.sourceQuery)).join(''):'<div class="empty">沒有符合條件的入口。</div>'}</div>`;
}
function getAIConfig(){try{return JSON.parse(sessionStorage.getItem('civic-ai-config')||'{}')}catch{return{}}}
function setAIConfig(cfg){sessionStorage.setItem('civic-ai-config',JSON.stringify(cfg));}
function aiPage(){const cfg=getAIConfig();return`<h2>AI Key、模型替換與使用限制</h2><section class="card danger-note"><p>瀏覽器自備金鑰（BYOK）適合公開官方資料與一般草稿，不適合個資、病歷、陳情、未公開文件或具體刑事指控。金鑰只存在本分頁 sessionStorage，關閉分頁即清除；本站無法替你保證供應商帳戶一定不計費，請在供應商後台關閉自動儲值或設定零預算。</p></section><form id="ai-form" class="form-grid card"><label>優先供應商<select name="provider"><option value="openrouter" ${cfg.provider==='openrouter'?'selected':''}>OpenRouter（只選價格明確為 0 的非中國模型）</option><option value="gemini" ${cfg.provider==='gemini'?'selected':''}>Gemini（免費額度需自行確認）</option><option value="groq" ${cfg.provider==='groq'?'selected':''}>Groq（免費額度需自行確認）</option></select></label><label>模型<select name="model"><option value="${esc(cfg.model||'')}">${esc(cfg.model||'請先檢查可用模型')}</option></select></label><label class="full">API Key<input name="key" type="password" value="${esc(cfg.key||'')}" autocomplete="off" placeholder="只保存在目前分頁"/></label><label>OpenRouter 實際供應商（選填）<input name="actual_provider" value="${esc(cfg.actual_provider||'')}" placeholder="例如：Google、Groq；空白則不限制實際推論商"/></label><label>每日本分頁呼叫上限<input name="daily_limit" type="number" min="1" max="50" value="${esc(cfg.daily_limit||10)}"/></label><label class="full"><input name="confirm" type="checkbox" ${cfg.confirm?'checked':''}/> 我了解：模型可能停止免費；系統只會在已發現的候選模型中替換，遇到價格不明、付款、額度或政策錯誤即停止，不自動切換付費模型。</label><div class="full action-row"><button id="discover-models" class="primary" type="button">檢查可用模型</button><button class="secondary" type="submit">儲存到本分頁</button><button id="clear-ai" class="danger-button" type="button">清除 Key</button></div><div id="ai-status" class="full status-line">${cfg.model?`目前模型：${esc(cfg.provider)} / ${esc(cfg.model)}`:'尚未設定。搜尋與本地草稿仍可使用。'}</div></form><section class="grid-2"><article class="card"><h3>自動替換規則</h3><ol><li>先即時取得供應商模型清單。</li><li>OpenRouter只保留輸入、輸出價格均為零，且模型開發者在非中國白名單者。</li><li>目前模型若回傳不存在、額度或付款錯誤，才嘗試下一個已核准候選。</li><li>沒有符合條件的模型就停止，不會自行改用付費模型。</li></ol></article><article class="card"><h3>資料保護</h3><ul><li>身分證、電話、電子郵件、病歷或未公開文件會在外送前阻擋。</li><li>模型輸出只作草稿，來源與引文仍須人工核對。</li><li>瀏覽器金鑰可能被同裝置上的惡意擴充功能讀取；高風險使用應改用受控後端或本機模型。</li></ul></article></section>`;}
function pageFor(route){return({home:homePage,reform:reformPage,questions:questionsPage,parties:partiesPage,compare:comparePage,legislation:legislationPage,sources:sourcesPage,ai:aiPage}[route]||homePage)();}

function toast(text){const old=document.querySelector('.copy-toast');old?.remove();const el=document.createElement('div');el.className='copy-toast';el.textContent=text;document.body.append(el);setTimeout(()=>el.remove(),1800);}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('已複製');}catch{toast('瀏覽器未允許複製');}}
function putOutput(id,text){const el=document.getElementById(id);if(el)el.textContent=text;}
function formDataObject(form){const fd=new FormData(form),out={};for(const [k,v] of fd.entries()){if(Object.prototype.hasOwnProperty.call(out,k)){out[k]=Array.isArray(out[k])?[...out[k],v]:[out[k],v];}else out[k]=v;}return out;}
function localReform(d){const rec=methodRecommendation(`${d.topic} ${d.evidence} ${d.current} ${d.goal}`);return`【人工智慧／規則式草稿，須人工查核】\n\n一、議題\n${d.topic}\n\n二、目前可確認的事實\n${d.evidence}\n\n三、法律形成與政策形成分流\n法律形成：確認現行法源、主管機關權限、法律保留、明確性、程序保障與救濟。\n政策形成：確認問題規模、替代方案、資源成本、利害關係人與預期／非預期效果。\n\n四、可能的制度檢討問題\n${d.goal}\n\n五、替代解釋\n資料增加可能來自通報改善、分類改變或母體變動；單一事件不能直接推論整體制度失靈。\n\n六、建議研究方法\n主要：${rec.primary.name}\n理由：${rec.primary.why}\n\n七、下一步\n1. 補齊官方原始文件與日期。\n2. 建立主張—證據矩陣。\n3. 盤點現行法、行政流程、預算與執行能力。\n4. 進行跨國功能比較，但不得直接移植外國制度。`;}
function localQuestions(d){return`【質詢草稿，須依官方資料與會議時間調整】\n\n議題：${d.topic}\n被詢答機關：${d.agency}\n核心資料：${d.evidence}\n希望取得的答案：${d.goal}\n\n一、事實確認\n1. 請說明目前掌握的案件數、期間、分母、資料來源及統計口徑。\n2. 相關資料是否曾更正、改版或停止公開？\n\n二、法律與權限\n3. 現行法源、主管機關權限與中央地方分工為何？\n4. 若涉及人民權利義務，法律保留、程序保障及救濟機制為何？\n\n三、政策與替代方案\n5. 目前政策目標、替代方案及不採其他方案的理由為何？\n6. 是否完成法規影響、財政、人權與性別影響評估？\n\n四、預算與執行\n7. 預算、人力、資訊系統及跨機關協作是否足以執行？\n8. 第一線標準作業程序、異常升級與閉環結案機制為何？\n\n五、責任與期限\n9. 請提出可驗證的改善指標、負責單位與完成期限。\n10. 若未達成，如何公開說明、補正與接受外部監督？`;}
function localParty(d){const rows=(state.parties.parties||[]).map(p=>({name:p.name,date:d[`${p.id}_date`]||'',url:d[`${p.id}_url`]||'',text:d[`${p.id}_text`]||''}));const complete=rows.filter(r=>r.date&&r.url&&r.text);let out=`【政黨立場比較草稿】\n\n議題：${d.issue}\n\n可比性檢查：${complete.length}/${rows.length} 個政黨具備日期、官方來源與主張文字。\n`;for(const r of rows)out+=`\n${r.name}\n- 日期：${r.date||'缺少'}\n- 官方來源：${r.url||'缺少'}\n- 主張：${r.text||'缺少'}\n`;out+=`\n判斷規則\n1. 資料不完整時，只能標示「證據不足」。\n2. 先區分政策目標、手段、條件、發言主體與文件層級。\n3. 不把時間變化或妥協直接稱為矛盾。\n4. 只有同一主體、同一問題與相近條件下的互斥主張，才可能是實質衝突。`;return out;}
function localDraft(d){const hasCurrent=compactText(d.current_text).length>0;const urls=String(d.sources||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);return`【人工智慧／規則式修法草稿；須查核現行法】\n\n一、草案名稱\n${d.law}${d.article}條文修正草案\n\n二、潤稿後案由\n本院○○，鑑於${compactText(d.problem)}。為${compactText(d.goal)}，並使相關權利義務、主管機關權限、執行程序及法律效果更為明確，爰擬具「${d.law}${d.article}條文修正草案」。是否有當？敬請公決。\n\n三、修法理由\n一、現行制度問題：${compactText(d.problem)}\n二、政策目的與公共利益：${compactText(d.goal)}\n三、擬修正方向：${compactText(d.change)}\n四、法制要求：應檢查法律保留、比例原則、法律明確性、正當程序、救濟及相關法規一致性。\n五、執行要求：應評估主管機關、人力、財政、資訊系統、第一線作業與施行日期。\n\n四、條文對照表草稿\n修正條文：\n${hasCurrent?'［請依下列現行條文逐句修訂，勿改動無關文字］':'［未提供現行條文，為避免捏造，暫不生成條文文字］'}\n\n現行條文：\n${hasCurrent?d.current_text:'［請自全國法規資料庫核對公布、施行及沿革後貼入］'}\n\n說明：\n1. 本次修正欲處理：${compactText(d.problem)}\n2. 採取方式：${compactText(d.change)}\n3. 選擇此方案的理由：應比較維持現狀、行政措施、補助／誘因、資訊揭露與法律修正等替代方案。\n\n五、潤稿與實質建議\n1. 將抽象政策口號改為可執行的主體、要件、期限、程序與效果。\n2. 若設裁罰或強制義務，必須明定構成要件、裁量界線與救濟。\n3. 若授權子法，應具體限定目的、內容與範圍。\n4. 若涉及地方政府或民間機構，應處理財源、責任分工與過渡期。\n5. 另設成效評估與定期檢討機制，避免法律通過後無法驗證效果。\n\n六、建議跨國比較\n以中華民國為基準，選擇 2 至 4 個制度功能相近的國家，使用功能比較法比較規範目的、主管機關、程序、財源、執行與救濟，而非只比對條文字面。\n\n七、官方來源\n${urls.length?urls.map((u,i)=>`${i+1}. ${u}`).join('\n'):'尚未提供；送出前至少補入現行法、立法資料與政策證據。'}\n\n八、不宜過度推論\n本草稿不能證明特定機關、政黨或個人違法、失職或應負法律責任。`;}
function localCompare(d){const selected=[...document.querySelectorAll('input[name="countries"]:checked')].map(x=>x.value).slice(0,5);const countries=state.jurisdictions.filter(j=>selected.includes(j.code));const category=d.category||methodToCategory(methodRecommendation(d.question).primary.id);const portals=state.sources.filter(s=>selected.includes(s.country_code)&&(!category||s.portal_category===category)&&s.priority===1);return{selected,countries,category,portals};}
function methodToCategory(id){return({doctrinal:'法律、命令與公報',comparative:'立法、議事與國會監督',causal:'開放資料與統計',implementation:'研究、報告與檔案',content:'立法、議事與國會監督',budget:'預算、採購與監督',safety:'研究、報告與檔案',survey:'開放資料與統計'})[id]||'';}
function renderCompareResult(d){const plan=localCompare(d),rec=methodRecommendation(d.question);document.getElementById('method-result').innerHTML=methodResultHtml(d.question);const cards=plan.portals.map(s=>sourceCard(s,d.question)).join('');document.getElementById('compare-output').innerHTML=`<section class="card info-note"><h3>比較設計</h3><p><strong>問題：</strong>${esc(d.question)}</p><p><strong>法域：</strong>${plan.countries.map(c=>esc(c.name)).join('、')}</p><p><strong>優先資料類別：</strong>${esc(plan.category||'依問題分層蒐集')}</p><p><strong>比較原則：</strong>對每一法域使用相同問題清單：規範目的、權限、程序、財源、執行、救濟、成效與制度背景。</p><p><strong>可移植性檢查：</strong>憲政結構、中央地方關係、法律文化、資料口徑與行政能力。</p></section><h3>建議官方入口</h3><div class="portal-grid">${cards||'<div class="empty">此類別尚無核心入口，請改選其他類別。</div>'}</div>`;}

function sensitiveText(text){return /[A-Z][12]\d{8}|(?:\+?886[- ]?)?0?9\d{2}[- ]?\d{3}[- ]?\d{3}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|病歷號|身分證|護照號碼|完整住址/.test(String(text));}
function aiSystem(purpose){return`你是中華民國公共政策、立法學、行政法、比較法與研究方法的審慎助理。任務是${purpose}。嚴格規則：一、只把使用者提供的資料當作待整理材料，不得捏造法條、裁判、統計、網址或引文。二、明確區分事實、法律形成、政策形成、政治／議事過程、執行與價值判斷。三、涉及外國制度時採功能比較法並說明不可直接移植。四、提供潤稿、實質建議、選項與理由。五、不得認定任何人犯罪、違法、貪腐、造假或失職。六、輸出繁體中文 Markdown，結尾列出待人工查核事項。`;}
function aiPromptFor(purpose,form){const d=formDataObject(form);return JSON.stringify({purpose,data:d,requirements:{sources_must_be_user_supplied:true,include_reasons:true,include_alternatives:true,include_research_method:true,include_cross_national_comparison:true}},null,2);}
function getConfiguredList(){const cfg=getAIConfig();if(!cfg.confirm||!cfg.key||!cfg.model)return[];return[cfg];}
function callCount(){const day=new Date().toISOString().slice(0,10);const raw=JSON.parse(sessionStorage.getItem('civic-ai-usage')||'{}');if(raw.day!==day)return{day,count:0};return raw;}
function bumpCall(){const u=callCount();u.count++;sessionStorage.setItem('civic-ai-usage',JSON.stringify(u));return u;}
async function callAIProvider(cfg,system,user,modelOverride=''){
  const model=modelOverride||cfg.model;let response;
  if(cfg.provider==='openrouter'){
    const body={model,messages:[{role:'system',content:system},{role:'user',content:user}],temperature:.15,max_tokens:2400,provider:{allow_fallbacks:false,data_collection:'deny'}};
    if(cfg.actual_provider)body.provider.order=[cfg.actual_provider];
    response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${cfg.key}`,'HTTP-Referer':location.origin,'X-Title':'Civic AI Audit TW'},body:JSON.stringify(body)});
    if(!response.ok)throw new Error(`OpenRouter ${response.status}`);const out=await response.json();return out.choices?.[0]?.message?.content||'';
  }
  if(cfg.provider==='gemini'){
    response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.key)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{temperature:.15,maxOutputTokens:2400}})});
    if(!response.ok)throw new Error(`Gemini ${response.status}`);const out=await response.json();return out.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  }
  if(cfg.provider==='groq'){
    response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${cfg.key}`},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:user}],temperature:.15,max_tokens:2400})});
    if(!response.ok)throw new Error(`Groq ${response.status}`);const out=await response.json();return out.choices?.[0]?.message?.content||'';
  }
  throw new Error('未知供應商');
}
async function runAI(purpose,form,outputId){
  const cfgs=getConfiguredList();if(!cfgs.length){location.hash='#ai';throw new Error('請先設定 AI Key、模型並勾選確認');}
  const payload=aiPromptFor(purpose,form);if(sensitiveText(payload))throw new Error('偵測到可能的個人資料，已阻擋外送');
  const cfg=cfgs[0],usage=callCount(),limit=Number(cfg.daily_limit||10);if(usage.count>=limit)throw new Error('已達本分頁自行設定的呼叫上限');putOutput(outputId,'AI 正在重新檢查免費／可用模型並整理資料……');
  try{
    const eligible=await fetchEligibleModels(cfg);if(!eligible.length)throw new Error('目前沒有符合條件的模型；已停止，未轉入付費');
    const ordered=[cfg.model,...eligible.filter(m=>m!==cfg.model)].filter(m=>eligible.includes(m)).slice(0,6);let lastError=null;
    for(const model of ordered){
      try{bumpCall();const text=await callAIProvider(cfg,aiSystem(purpose),payload,model);if(!text)throw new Error('模型沒有回傳文字');cfg.model=model;cfg.candidate_models=eligible;setAIConfig(cfg);putOutput(outputId,`【AI 生成／須人工查核】\n【實際模型：${cfg.provider} / ${model}】\n\n${text}`);return;}catch(e){lastError=e;}
    }
    throw lastError||new Error('所有候選模型均失敗');
  }catch(e){putOutput(outputId,`AI 呼叫失敗：${e.message}\n\n系統已停止，未轉入付費模型。可重新檢查模型，或使用本地草稿。`);}
}
async function fetchEligibleModels(cfg){
  let models=[];
  if(cfg.provider==='openrouter'){
    const r=await fetch('https://openrouter.ai/api/v1/models',{headers:{authorization:`Bearer ${cfg.key}`}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const out=await r.json();
    models=(out.data||[]).filter(m=>{const id=String(m.id||''),p=m.pricing||{};const free=Number(p.prompt)===0&&Number(p.completion)===0;return free&&ALLOWED_MODEL_PREFIXES.some(x=>id.startsWith(x))&&!BLOCKED_MODEL_PREFIXES.some(x=>id.startsWith(x));}).map(m=>m.id);
  } else if(cfg.provider==='gemini'){
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.key)}`);if(!r.ok)throw new Error(`HTTP ${r.status}`);const out=await r.json();
    models=(out.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>String(m.name||'').replace(/^models\//,'')).filter(x=>/flash/i.test(x));
  } else if(cfg.provider==='groq'){
    const r=await fetch('https://api.groq.com/openai/v1/models',{headers:{authorization:`Bearer ${cfg.key}`}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const out=await r.json();
    models=(out.data||[]).map(m=>m.id).filter(id=>!BLOCKED_MODEL_PREFIXES.some(x=>String(id).startsWith(x)));
  }
  return [...new Set(models)].slice(0,30);
}
async function discoverModels(form){
  const d=formDataObject(form),status=document.getElementById('ai-status'),select=form.elements.model;if(!d.key){status.textContent='請先輸入 API Key。';return;}
  status.textContent='正在向供應商查詢模型清單……';
  try{
    const models=await fetchEligibleModels(d);if(!models.length)throw new Error('沒有找到符合目前條件的候選模型');
    form.dataset.candidateModels=JSON.stringify(models);select.innerHTML=models.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
    status.innerHTML=`<span class="status-ok">找到 ${models.length} 個候選模型。每次呼叫前會重新檢查；若目前模型不存在或 OpenRouter 價格不再為零，系統會改用下一個候選。Gemini／Groq 的免費額度仍需在供應商帳戶確認。</span>`;
  }catch(e){status.innerHTML=`<span class="status-error">檢查失敗：${esc(e.message)}。可能是金鑰、CORS、限流或供應商政策所致。</span>`;}
}

function bindPage(){
  document.querySelectorAll('.tabs a').forEach(a=>a.classList.toggle('active',a.dataset.route===state.route));
  document.querySelectorAll('.copy-button').forEach(b=>b.addEventListener('click',()=>copyText(b.dataset.copy||'')));
  document.querySelectorAll('.copy-output').forEach(b=>b.addEventListener('click',()=>copyText(document.getElementById(b.dataset.target)?.textContent||'')));
  const sf=document.getElementById('search-form');if(sf)sf.addEventListener('submit',e=>{e.preventDefault();state.query=document.getElementById('global-search').value.trim();location.hash=`#home${state.query?`?q=${encodeURIComponent(state.query)}`:''}`;document.getElementById('search-results').innerHTML=renderSearchResults(state.query);bindPage();});
  const reform=document.getElementById('reform-form');if(reform)reform.addEventListener('submit',e=>{e.preventDefault();putOutput('reform-output',localReform(formDataObject(reform)));});
  const qform=document.getElementById('question-form');if(qform)qform.addEventListener('submit',e=>{e.preventDefault();putOutput('question-output',localQuestions(formDataObject(qform)));});
  const pform=document.getElementById('party-form');if(pform)pform.addEventListener('submit',e=>{e.preventDefault();putOutput('party-output',localParty(formDataObject(pform)));});
  const dform=document.getElementById('draft-form');if(dform)dform.addEventListener('submit',e=>{e.preventDefault();putOutput('draft-output',localDraft(formDataObject(dform)));});
  const cform=document.getElementById('compare-form');if(cform)cform.addEventListener('submit',e=>{e.preventDefault();const checked=[...cform.querySelectorAll('input[name="countries"]:checked')];if(checked.length>5){toast('最多選擇 5 個法域');return;}renderCompareResult(formDataObject(cform));bindPage();});
  document.querySelectorAll('.ai-action').forEach(btn=>btn.addEventListener('click',async()=>{const purpose=btn.dataset.purpose;const map={reform:['reform-form','reform-output','改革分析與潤稿'],questions:['question-form','question-output','立法委員質詢題庫'],parties:['party-form','party-output','政黨政策立場一致性與變動分析'],compare:['compare-form','compare-output','跨國比較研究計畫'],legislation:['draft-form','draft-output','修法與立法理由草案']};const [fid,oid,label]=map[purpose]||[];const form=document.getElementById(fid);if(form)await runAI(label,form,oid);}));
  const country=document.getElementById('source-country'),cat=document.getElementById('source-category'),filter=document.getElementById('source-filter'),core=document.getElementById('source-core');
  const refreshSourceGrid=()=>{if(cat)state.sourceCategory=cat.value;if(filter)state.sourceQuery=filter.value;if(core)state.sourceCoreOnly=core.checked;const rows=filteredSources(),grid=document.getElementById('source-grid'),count=document.getElementById('source-count');if(grid)grid.innerHTML=rows.length?rows.map(s=>sourceCard(s,state.sourceQuery)).join(''):'<div class="empty">沒有符合條件的入口。</div>';if(count)count.textContent=String(rows.length);document.querySelectorAll('#source-grid .copy-button').forEach(b=>b.addEventListener('click',()=>copyText(b.dataset.copy||'')));};
  country?.addEventListener('change',()=>{state.sourceCountry=country.value;state.sourceCategory='';document.getElementById('app').innerHTML=sourcesPage();bindPage();});cat?.addEventListener('change',refreshSourceGrid);filter?.addEventListener('input',()=>{clearTimeout(filter._t);filter._t=setTimeout(refreshSourceGrid,180);});core?.addEventListener('change',refreshSourceGrid);
  const aiform=document.getElementById('ai-form');if(aiform){document.getElementById('discover-models')?.addEventListener('click',()=>discoverModels(aiform));aiform.addEventListener('submit',e=>{e.preventDefault();const d=formDataObject(aiform);d.confirm=aiform.elements.confirm.checked;if(!d.confirm){document.getElementById('ai-status').innerHTML='<span class="status-error">請先勾選使用限制確認。</span>';return;}d.candidate_models=JSON.parse(aiform.dataset.candidateModels||'[]');setAIConfig(d);document.getElementById('ai-status').innerHTML=`<span class="status-ok">已保存於目前分頁：${esc(d.provider)} / ${esc(d.model)}。呼叫前會重新檢查並自動替換失效候選。</span>`;});document.getElementById('clear-ai')?.addEventListener('click',()=>{sessionStorage.removeItem('civic-ai-config');sessionStorage.removeItem('civic-ai-usage');aiform.reset();document.getElementById('ai-status').textContent='已清除 Key 與使用紀錄。';});}
}
function render(){parseHash();document.getElementById('app').innerHTML=pageFor(state.route);bindPage();document.getElementById('app').focus({preventScroll:true});const highlighted=document.querySelector('.highlight');if(highlighted)setTimeout(()=>highlighted.scrollIntoView({block:'center'}),50);}
async function loadJson(path,fallback){try{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(`${r.status}`);return await r.json();}catch(e){console.warn(`無法載入 ${path}`,e);return fallback;}}
async function init(){const [runtime,index,analyses,parties,theories,method,sources,jurisdictions,researchMethods]=await Promise.all([loadJson('config/runtime.json',{}),loadJson('data/search-index.json',{documents:[]}),loadJson('data/analyses.json',[]),loadJson('data/party_positions.json',{parties:[],comparison_rules:[]}),loadJson('data/theory_catalog.json',[]),loadJson('data/methodology.json',{}),loadJson('data/sources.json',[]),loadJson('data/jurisdictions.json',[]),loadJson('data/research_methods.json',[])]);Object.assign(state,{runtime,searchIndex:index,analyses,parties,theories,methodology:method,sources,jurisdictions,researchMethods});const repo=document.getElementById('repo-link');if(runtime.repository_url)repo.href=safeUrl(runtime.repository_url);else repo.style.display='none';document.getElementById('build-label').textContent=runtime.build_label||'公開測試版';render();}
document.getElementById('theme-toggle').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('theme',next);});const saved=localStorage.getItem('theme');if(saved)document.documentElement.dataset.theme=saved;window.addEventListener('hashchange',render);init();
