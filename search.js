'use strict';
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivicSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  let ontology = [];
  const STOP = new Set(['什麼','為什麼','怎麼','如何','是否','有沒有','哪個','哪些','可以','需要','目前','最近','相關','問題','資料','內容','一下','真的','一直','今年']);
  // 一般民眾常用的政策與制度詞。這些詞只用於切分自然語句，
  // 不會自動建立「近義」關係，也不會擴張成使用者過往議題。
  const PUBLIC_TERMS = [
    '政府預算','總預算','決算','稅金','歲入','歲出','補助','採購','決標','招標',
    '房價','租金','社會住宅','住宅政策','居住正義','電價','能源政策','核能','再生能源',
    '少子化','高齡化','長期照顧','長期照護','健保','醫療','公共衛生','教育','托育',
    '最低工資','勞動契約','工時','職災','交通安全','酒駕','高齡駕駛','環境影響',
    '法律草案','現行法','三讀','法條','判決','裁判書','行政命令','違法','救濟',
    '政策成效','執行落差','第一線','行政裁量','問責','監督','質詢','政黨立場',
    '跨國比較','國際比較','因果關係','研究方法','期刊論文','學說','理論','證據'
  ];
  const INTENT_RULES = [
    ['literature',/學說|理論|論文|期刊|文獻|研究證據|systematic review|meta-analysis/i],
    ['law',/第[0-9零〇一二三四五六七八九十百千萬]+(?:之[0-9零〇一二三四五六七八九十百千萬]+)?條|法規|法條|法律|條例|辦法|合法|違法|裁罰|救濟|憲法/],
    ['causal',/有效|成效|影響|導致|造成|改善|是否有用|能否|能讓|降低|下降|增加|減少|提升|前後|因果|效果/],
    ['comparative',/比較|差異|他國|外國|國際|日本|美國|英國|歐盟|韓國|新加坡|澳洲|加拿大/],
    ['budget',/預算|決算|經費|歲入|歲出|成本|財政|補助|採購/],
    ['implementation',/執行|第一線|流程|SOP|落差|協作|通報|人力|行政能力|做不到/],
    ['accountability',/誰負責|責任|監督|質詢|課責|問責|稽核|調查/],
    ['position',/政黨|立場|主張|承諾|矛盾|一致性|變動/],
    ['fact',/多少|何時|哪些|在哪裡|誰|公布|統計|名單/]
  ];
  function configure(items){ ontology = Array.isArray(items)?items:[]; }
  function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[，。；：、！？「」『』（）()【】\[\]〈〉《》“”"'`~!@#$%^&*+=|\\/:;,.?<>_-]+/g,' ').replace(/\s+/g,' ').trim();}
  function compact(value){return normalize(value).replace(/\s+/g,'');}
  function unique(v){return [...new Set((v||[]).filter(Boolean))];}
  function tokenise(query){
    const raw=normalize(query);
    const rawCompact=compact(raw);
    const spaced=raw.split(' ').filter(x=>x && !STOP.has(x));
    const found=[];
    for(const concept of ontology){
      const names=[concept.canonical,...(concept.aliases||[]).map(x=>x.term)];
      for(const term of names){
        const tc=compact(term);
        if(tc && rawCompact.includes(tc)) found.push(term);
      }
    }
    for(const term of PUBLIC_TERMS){
      const tc=compact(term);
      if(tc && rawCompact.includes(tc)) found.push(term);
    }
    if(spaced.length>1) return unique([...found,...spaced.filter(x=>compact(x).length>=2)]);
    // 對完整自然語句，不把整句當作唯一檢索詞；只有完全無法辨識核心詞時才保留整句。
    if(!found.length && rawCompact && !STOP.has(rawCompact)) found.push(rawCompact);
    return unique(found);
  }
  function variants(query){
    const q=compact(query); const out=[{term:q,weight:1,relation:'original',label:'原始查詢'}];
    for(const concept of ontology){
      const all=[{term:concept.canonical,relation:'canonical',weight:0.98},...(concept.aliases||[])];
      if(all.some(x=>q===compact(x.term)||q.includes(compact(x.term))||compact(x.term).includes(q))){
        for(const x of all) out.push({term:compact(x.term),weight:Number(x.weight||0.85),relation:x.relation||'alias',label:`${concept.canonical}／${x.relation||'名稱變體'}`});
      }
    }
    const map=new Map(); for(const x of out){if(!x.term)continue;if(!map.has(x.term)||map.get(x.term).weight<x.weight)map.set(x.term,x);} return [...map.values()];
  }
  function classifyIntent(query){
    const raw=normalize(query); const intents=INTENT_RULES.filter(x=>x[1].test(raw)).map(x=>x[0]);
    if(!intents.length) intents.push('exploratory');
    const primary=['law','causal','comparative','budget','implementation','accountability','literature','position','fact','exploratory'].find(x=>intents.includes(x))||intents[0];
    return {primary,intents};
  }
  function planQuery(query){
    const intent=classifyIntent(query); const terms=tokenise(query); const alias=variants(query).filter(x=>x.weight<1);
    const methodMap={law:['doctrinal'],causal:['causal'],comparative:['comparative'],budget:['budget'],implementation:['implementation'],accountability:['content','implementation'],literature:['mixed'],position:['content'],fact:['mixed'],exploratory:['mixed']};
    return {raw:String(query||''),normalized:normalize(query),primary_intent:intent.primary,intents:intent.intents,terms,controlled_aliases:alias,excluded_rule:'相關概念不自動當成近義詞；只使用正式名稱、縮寫與常用語形變體。',recommended_methods:unique(intent.intents.flatMap(x=>methodMap[x]||[]))};
  }
  function field(doc,name){if(name==='title')return normalize(doc.title||'');if(name==='tags')return normalize((doc.tags||[]).join(' '));if(name==='body')return normalize(doc.body||'');return normalize(doc.searchable||`${doc.title||''} ${(doc.tags||[]).join(' ')} ${doc.body||''}`);}
  function count(text,term){const s=compact(text),t=compact(term);if(!s||!t)return 0;let n=0,p=0;while((p=s.indexOf(t,p))>=0){n++;p+=Math.max(1,t.length);}return n;}
  function df(corpus,term){return corpus.reduce((n,d)=>n+(compact(field(d,'all')).includes(compact(term))?1:0),0);}
  function idf(total,freq){return Math.max(0.65,Math.log(1+(total-freq+0.5)/(freq+0.5)));}
  function scoreDocument(doc,query,corpus){
    const q=compact(query); if(!q)return {...doc,score:0,tier:'none',match_reason:'未輸入查詢詞'};
    const title=field(doc,'title'),tags=field(doc,'tags'),body=field(doc,'body'),all=field(doc,'all');
    const terms=tokenise(query), vars=variants(query), reasons=[]; let score=0,anchor=0,direct=false;
    for(const v of vars){
      const rarity=idf(Math.max(1,corpus.length),df(corpus,v.term)); const th=count(title,v.term),tg=count(tags,v.term),bh=count(body,v.term);
      const component=v.weight*rarity*(th*12+tg*7+Math.min(bh,2)*2.2); score+=component; anchor=Math.max(anchor,component);
      if(compact(title)===v.term&&v.weight===1){score+=45;anchor=Math.max(anchor,45);direct=true;reasons.push('標題完全符合');}
      else if(compact(title).includes(v.term)){score+=18*v.weight;anchor=Math.max(anchor,18*v.weight);if(v.weight>=.95)direct=true;reasons.push(v.weight===1?'標題直接命中':'標題命中受控名稱變體');}
      else if(compact(tags).includes(v.term)){score+=8*v.weight;anchor=Math.max(anchor,8*v.weight);reasons.push(v.weight===1?'標籤直接命中':'標籤命中受控名稱變體');}
      else if(compact(body).includes(v.term)){score+=4.5*v.weight;anchor=Math.max(anchor,4.5*v.weight);reasons.push(v.weight===1?'內容直接命中':'內容命中受控名稱變體');}
    }
    if(terms.length){const matched=terms.filter(t=>compact(all).includes(compact(t)));const coverage=matched.length/terms.length;
      if(terms.length>=2&&coverage===1){score+=24;anchor=Math.max(anchor,24);direct=true;reasons.push('全部核心詞均命中');}
      else if(coverage>=.6){score+=12*coverage;anchor=Math.max(anchor,7);reasons.push(`命中 ${matched.length}/${terms.length} 個核心詞`);}
      if(terms.length>=2&&coverage<.5)return {...doc,score:0,tier:'none',match_reason:'核心詞覆蓋不足'};
    }
    if(anchor<3.5||score<5)return {...doc,score:0,tier:'none',match_reason:'沒有足夠詞彙證據'};
    score+=(doc.official?0.55:0)+(doc.human_reviewed?0.45:0)+(doc.peer_reviewed?0.35:0);
    return {...doc,score:Math.round(score*10)/10,tier:direct?'direct':'related',match_reason:unique(reasons).slice(0,3).join('；')||'詞彙相關'};
  }
  function searchDocuments(documents,query,limit=15){const corpus=documents||[];return corpus.map(d=>scoreDocument(d,query,corpus)).filter(d=>d.score>0).sort((a,b)=>(a.tier===b.tier?0:a.tier==='direct'?-1:1)||b.score-a.score||String(a.title).localeCompare(String(b.title),'zh-Hant')).slice(0,limit);}
  function explainExpansion(query){return variants(query).filter(x=>x.weight<1).map(x=>({term:x.term,reason:x.label,weight:x.weight,relation:x.relation}));}
  return {configure,normalize,compact,tokenise,controlledVariants:variants,explainExpansion,classifyIntent,planQuery,scoreDocument,searchDocuments};
});
