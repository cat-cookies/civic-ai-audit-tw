
'use strict';

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivicPolitical = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const PARTY_ALIASES = {
    dpp: ['民主進步黨','民進黨','dpp','執政黨'],
    kmt: ['中國國民黨','國民黨','kmt'],
    tpp: ['台灣民眾黨','民眾黨','tpp']
  };
  const PRAISE = ['肯定','成功','改善','有效','穩健','專業','負責','支持','達成','守護','進步','成果','提升','落實','正確'];
  const CRITICISM = ['失敗','荒謬','黑箱','卸責','無能','違法','爭議','質疑','批評','痛批','打臉','翻車','操弄','抹黑','謊言','貪腐','錯誤','失職'];
  const DESCRIPTIVE = ['表示','指出','說明','公布','提出','回應','依據','資料顯示','報告','會議','法案','條文','統計'];
  const NEGATION = ['不','未','沒有','反對','停止','取消','否認','拒絕'];
  const STOP = ['為民服務','促進福祉','全民福祉','愛民','愛鄉土','人民最大福祉'];

  function normalize(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  }
  function countTerms(text, terms) {
    const n = normalize(text);
    return terms.reduce((sum, term) => {
      const needle = normalize(term);
      if (!needle) return sum;
      let pos = 0, count = 0;
      while ((pos = n.indexOf(needle, pos)) >= 0) { count += 1; pos += needle.length; }
      return sum + count;
    }, 0);
  }
  function windows(text, aliases, radius = 90) {
    const source = String(text || '');
    const lower = source.toLowerCase();
    const out = [];
    aliases.forEach(alias => {
      const needle = alias.toLowerCase();
      let pos = 0;
      while ((pos = lower.indexOf(needle, pos)) >= 0) {
        out.push(source.slice(Math.max(0, pos - radius), Math.min(source.length, pos + needle.length + radius)));
        pos += needle.length;
      }
    });
    return [...new Set(out)];
  }
  function scoreTone(text, aliases) {
    const slices = windows(text, aliases);
    const scope = slices.length ? slices.join('\n') : '';
    const praise = countTerms(scope, PRAISE);
    const criticism = countTerms(scope, CRITICISM);
    const descriptive = countTerms(scope, DESCRIPTIVE);
    const total = praise + criticism + descriptive;
    return {
      mentions: slices.length, praise, criticism, descriptive,
      praise_rate: total ? praise / total : 0,
      criticism_rate: total ? criticism / total : 0,
      descriptive_rate: total ? descriptive / total : 0,
      evidence_windows: slices.slice(0, 4)
    };
  }
  function ideologyKeywords(profile) {
    return [...new Set((profile?.dimensions || []).flatMap(d => d.keywords || []).filter(k => !STOP.includes(k)))];
  }
  function ideologySimilarity(text, profile) {
    const keys = ideologyKeywords(profile);
    const hits = keys.filter(k => normalize(text).includes(normalize(k)));
    return {score: keys.length ? hits.length / keys.length : 0, hits, denominator: keys.length};
  }
  function compareStatements(earlier, current) {
    const a = normalize(earlier), b = normalize(current);
    if (!a || !b) return {status:'證據不足', confidence:'低', reasons:['須同時提供前期與近期原文。']};
    const aNeg = countTerms(a, NEGATION), bNeg = countTerms(b, NEGATION);
    const chars = new Set([...a]);
    const overlap = [...new Set([...b])].filter(c => chars.has(c)).length;
    const union = new Set([...a, ...b]).size || 1;
    const similarity = overlap / union;
    if (similarity >= 0.62 && Math.abs(aNeg - bNeg) <= 1) return {status:'立場大致延續', confidence:'中', reasons:['核心字詞高度重疊，未偵測到明顯否定方向改變。'], similarity};
    if (similarity >= 0.42) return {status:'可能為手段或條件調整', confidence:'低至中', reasons:['部分核心概念延續，但條件、工具或語氣改變，需人工拆分命題。'], similarity};
    if (Math.abs(aNeg - bNeg) >= 2) return {status:'可能存在方向性變動', confidence:'低', reasons:['否定或反對語句數量改變；規則式結果不能單獨判定反轉。'], similarity};
    return {status:'表面不一致，尚待釐清', confidence:'低', reasons:['詞彙重疊低；可能是議題、主體、文類或情境不同。'], similarity};
  }
  function analyzeMedia({headline='', body='', sources='', right_of_reply=false, profiles=[]}) {
    const text = `${headline}\n${body}`;
    const partyScores = {};
    for (const [id, aliases] of Object.entries(PARTY_ALIASES)) {
      const tone = scoreTone(text, aliases);
      const profile = profiles.find(p => p.party_id === id);
      partyScores[id] = {...tone, ideology:ideologySimilarity(text, profile)};
    }
    const sourceCount = [...new Set(String(sources || '').split(/\n+/).map(x=>x.trim()).filter(Boolean))].length;
    const allTone = Object.values(partyScores).reduce((sum, x) => sum + x.praise + x.criticism + x.descriptive, 0);
    const praise = Object.values(partyScores).reduce((sum, x) => sum + x.praise, 0);
    const criticism = Object.values(partyScores).reduce((sum, x) => sum + x.criticism, 0);
    const descriptive = Object.values(partyScores).reduce((sum, x) => sum + x.descriptive, 0);
    const toneBalance = 1 - Math.abs(praise - criticism) / (praise + criticism + 1);
    const descriptiveShare = descriptive / (allTone + 1);
    const sourceDiversity = Math.min(1, sourceCount / 4);
    const reply = right_of_reply ? 1 : 0;
    const headlineTokens = new Set((headline.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}/g) || []).map(normalize));
    const bodyNorm = normalize(body);
    const headlineConsistency = headlineTokens.size ? [...headlineTokens].filter(t => bodyNorm.includes(t)).length / headlineTokens.size : 0.5;
    const evidenceDensity = Math.min(1, sourceCount / 3);
    const neutrality = 100 * (0.25*descriptiveShare + 0.20*toneBalance + 0.20*sourceDiversity + 0.15*reply + 0.10*headlineConsistency + 0.10*evidenceDensity);
    const alignments = Object.entries(partyScores).map(([id, x]) => ({id, score:x.ideology.score, hits:x.ideology.hits})).sort((a,b)=>b.score-a.score);
    const top = alignments[0], second = alignments[1];
    const alignmentLabel = top && top.score >= 0.12 && (top.score - (second?.score || 0)) >= 0.04
      ? `論述詞彙較接近 ${top.id.toUpperCase()} 的官方意識形態基準`
      : '沒有足夠差距可標示單一政黨論述接近度';
    return {
      partyScores, neutrality:Math.round(neutrality*10)/10,
      components:{descriptiveShare,toneBalance,sourceDiversity,reply,headlineConsistency,evidenceDensity},
      alignmentLabel, alignments,
      caveats:[
        '這是單篇文本的規則式初篩，不是媒體整體政治偏向。',
        '稱讚與批評的平衡不能取代議題選擇、框架、來源與未報導事件分析。',
        '官方論述接近度只表示詞彙或框架相似，不表示支持、協調或控制。'
      ]
    };
  }
  function parseCsv(text) {
    const rows=[]; let row=[], field='', quoted=false;
    for(let i=0;i<String(text).length;i++){
      const ch=text[i], next=text[i+1];
      if(ch==='"' && quoted && next==='"'){field+='"';i++;continue;}
      if(ch==='"'){quoted=!quoted;continue;}
      if(ch===',' && !quoted){row.push(field);field='';continue;}
      if((ch==='\n'||ch==='\r') && !quoted){if(ch==='\r'&&next==='\n')i++;row.push(field);if(row.some(x=>x!==''))rows.push(row);row=[];field='';continue;}
      field+=ch;
    }
    row.push(field);if(row.some(x=>x!==''))rows.push(row);
    if(rows.length<2)return[];
    const headers=rows[0].map(x=>x.trim());
    return rows.slice(1).map(cols=>Object.fromEntries(headers.map((h,i)=>[h,cols[i]||''])));
  }
  function analyzeCorpus(rows, profiles=[]) {
    const items=(rows||[]).map(row=>({row,result:analyzeMedia({headline:row.headline,body:row.body,sources:row.source_urls,right_of_reply:/^(true|1|yes|是)$/i.test(row.right_of_reply||''),profiles})}));
    const dates=items.map(x=>new Date(x.row.published_at)).filter(d=>!Number.isNaN(d.getTime())).sort((a,b)=>a-b);
    const weeks=dates.length>1?Math.max(1,Math.ceil((dates.at(-1)-dates[0])/(7*86400000))):0;
    const issues=new Set(items.map(x=>x.row.issue||x.row.topic||'未分類').filter(Boolean));
    const types=new Set(items.map(x=>x.row.article_type||'未分類'));
    const aggregate={};
    for(const id of Object.keys(PARTY_ALIASES)){
      const values=items.map(x=>x.result.partyScores[id]);
      aggregate[id]={
        praise:values.reduce((s,x)=>s+x.praise,0), criticism:values.reduce((s,x)=>s+x.criticism,0), descriptive:values.reduce((s,x)=>s+x.descriptive,0),
        ideology:values.length?values.reduce((s,x)=>s+x.ideology.score,0)/values.length:0
      };
    }
    const threshold=items.length>=30&&issues.size>=3&&weeks>=4&&types.size>=1;
    const avgNeutral=items.length?items.reduce((s,x)=>s+x.result.neutrality,0)/items.length:0;
    const ranked=Object.entries(aggregate).map(([id,x])=>({id,score:x.ideology})).sort((a,b)=>b.score-a.score);
    const label=threshold&&ranked[0]&&ranked[0].score>=0.10&&(ranked[0].score-(ranked[1]?.score||0))>=0.03
      ? `在目前語料與維度下，整體論述較接近 ${ranked[0].id.toUpperCase()} 官方基準；仍不是意圖或控制的證明。`
      : '樣本或政黨差距不足，不標示媒體整體較接近單一政黨。';
    return {items:items.length,weeks,issues:issues.size,types:[...types],threshold,avgNeutral:Math.round(avgNeutral*10)/10,aggregate,label};
  }
  return {PARTY_ALIASES,scoreTone,ideologySimilarity,compareStatements,analyzeMedia,parseCsv,analyzeCorpus};
});
