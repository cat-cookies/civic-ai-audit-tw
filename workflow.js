'use strict';

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CivicWorkflow=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const STOP=new Set(['議題','問題','制度','政策','研究','分析','比較','影響','台灣','中華民國','社會']);
  const DIMENSIONS={
    law:['法規名稱或制度範圍','爭議行為或規範缺口','希望判斷的法律效果','時間版本或施行階段'],
    health:['對象或族群','介入／暴露與比較組','重要結果與危害','照護場域與追蹤期間'],
    policy:['政策對象','政策工具或制度','希望改善的結果','比較基準、期間或地區'],
    politics:['政黨或政治主體','具體議題與主張','比較期間','要比較言論、提案、投票或執行'],
    media:['媒體與文章類型','具體事件／議題','比較政黨或框架','時間窗與樣本範圍'],
    science:['研究對象','核心變項或介入','結果指標','研究設計或文獻期間'],
    general:['誰或哪個制度','具體想知道什麼','時間與地點','要做描述、因果、比較或改革判斷']
  };
  function normalize(v){return String(v||'').normalize('NFKC').replace(/\s+/g,' ').trim();}
  function tokens(v){return normalize(v).toLowerCase().match(/[\p{Script=Han}]{2,}|[a-z][a-z0-9-]{2,}|\d+(?:\.\d+)?/gu)||[];}
  function broadness(prompt,subject='general'){
    const text=normalize(prompt),ts=tokens(text).filter(x=>!STOP.has(x));
    const hasQuestion=/[？?]|是否|為何|如何|多少|哪個|影響|造成|改善|比較|評估|修法|違法|有效/.test(text);
    const hasScope=/第\s*[0-9一二三四五六七八九十百]+\s*條|民國\s*\d+|20\d{2}|近\s*\d+\s*年|台灣|中華民國|美國|日本|歐盟|縣|市|醫院|學校|媒體|政黨/.test(text);
    const score=(text.length>=18?2:0)+(ts.length>=4?2:0)+(hasQuestion?2:0)+(hasScope?1:0);
    return {isBroad:score<5,score,reasons:[text.length<18?'提示過短':'',ts.length<4?'可辨識概念不足':'',!hasQuestion?'尚未表明要回答的問題':'',!hasScope?'缺少時間、法域、對象或場域':''].filter(Boolean),subject};
  }
  function grillQuestions(prompt,subject='general'){
    const base=DIMENSIONS[subject]||DIMENSIONS.general;
    const templates=[
      {id:'scope',label:base[0],placeholder:'請限定主要對象、制度、法規或族群。'},
      {id:'mechanism',label:base[1],placeholder:'請指出要檢查的行為、介入、機制或比較項。'},
      {id:'outcome',label:base[2],placeholder:'請指出想判斷的結果、權利、風險或政策目標。'},
      {id:'time',label:base[3],placeholder:'請限定年份、期間、地區或資料版本。'},
      {id:'decision',label:'你準備用答案做什麼？',placeholder:'例如理解議題、寫研究計畫、提出質詢、比較制度或修法。'}
    ];
    return templates;
  }
  function refinePrompt(prompt,answers,subject){
    const parts=[normalize(prompt)];
    for(const q of grillQuestions(prompt,subject)){const v=normalize(answers?.[q.id]);if(v)parts.push(`${q.label}：${v}`);}
    return parts.join('；');
  }
  function exactExpansion(prompt){
    const dictionary=[
      ['個資法','個人資料保護法'],['勞基法','勞動基準法'],['長照法','長期照顧服務法'],['國賠法','國家賠償法'],['政採法','政府採購法'],['刑訴','刑事訴訟法'],['民訴','民事訴訟法'],['SR','systematic review'],['RCT','randomized controlled trial'],['QES','quasi-experimental study'],['DiD','difference-in-differences'],['RDD','regression discontinuity design']
    ];
    const text=normalize(prompt).toLowerCase(),out=[];
    for(const [a,b] of dictionary){if(text.includes(a.toLowerCase())||text.includes(b.toLowerCase()))out.push({term:a,type:'常用縮寫',source:'內建正式名稱對照'},{term:b,type:'正式名稱',source:'內建正式名稱對照'});}
    return [...new Map(out.map(x=>[x.term.toLowerCase(),x])).values()];
  }
  function inferQuestionType(prompt){
    const t=normalize(prompt);
    if(/危害|副作用|有害|風險|中毒|致癌|傷害/.test(t))return'harms';
    if(/診斷|篩檢|敏感度|特異度/.test(t))return'diagnosis';
    if(/預後|存活|復發|長期發展/.test(t))return'prognosis';
    if(/有效|效果|成效|介入|治療|方案/.test(t))return'intervention';
    if(/因果|造成|導致|影響/.test(t))return'causal_policy';
    if(/執行|落實|流程|實施|接受度/.test(t))return'implementation';
    if(/經驗|感受|觀點|意義|文化/.test(t))return'qualitative';
    if(/第.*條|法律|法規|違法|憲法|裁判|判決/.test(t))return'legal';
    return'descriptive';
  }
  function sessionTemplate(){return{prompt:'',refinedPrompt:'',subject:'auto',jurisdiction:'TW',scope:'official_professional',domains:'',freshness:'any',grillAnswers:{},expansionEnabled:false,expansionTerms:[],discovery:null,extracted:[],literature:[],selectedLiterature:[],academicSynthesis:null,graph:null,comparisons:[],analysis:null,legislation:null,reflection:null,updatedAt:new Date().toISOString()};}
  return{normalize,tokens,broadness,grillQuestions,refinePrompt,exactExpansion,inferQuestionType,sessionTemplate};
});
