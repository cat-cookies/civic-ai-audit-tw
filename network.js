'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CivicNetwork=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const TYPE_LABELS={issue:'核心議題',actor:'行動者',institution:'制度／機關',law:'法規',mechanism:'機制',outcome:'結果',value:'價值',evidence:'證據',counter:'反方',intervention:'改革工具'};
  function safe(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fallbackGraph(prompt,sources=[]){
    const nodes=[{id:'issue',label:prompt.slice(0,48),type:'issue',weight:8,source_ids:[]}];const edges=[];
    const fixed=[['actors','相關機關與利害關係人','actor'],['rules','法律、政策與資源配置','institution'],['mechanism','制度如何產生結果','mechanism'],['outcome','預期效果與可能危害','outcome'],['counter','替代解釋與反對意見','counter'],['reform','改革工具與執行條件','intervention']];
    fixed.forEach(([id,label,type])=>{nodes.push({id,label,type,weight:4,source_ids:[]});edges.push({source:'issue',target:id,label:type==='counter'?'挑戰':'關聯'});});
    sources.slice(0,6).forEach((s,i)=>{const id=`src${i}`;nodes.push({id,label:String(s.title||`來源${i+1}`).slice(0,36),type:'evidence',weight:2,source_ids:[s.source_id||s.id||`SRC-${i+1}`]});edges.push({source:id,target:'issue',label:'支持／限制'});});
    return{nodes,edges,notice:'這是概念關聯圖，不是統計學上的網絡統合分析；邊線表示待驗證關係，不代表因果。'};
  }
  function render(container,graph){
    if(!container)return;const nodes=graph?.nodes||[],edges=graph?.edges||[];if(!nodes.length){container.innerHTML='<div class="empty">尚無概念網絡。</div>';return;}
    const width=Math.max(760,container.clientWidth||900),height=560,cx=width/2,cy=height/2;
    const center=nodes.find(n=>n.type==='issue')||nodes[0],others=nodes.filter(n=>n!==center);
    const pos=new Map([[center.id,{x:cx,y:cy}]]);others.forEach((n,i)=>{const ring=i<8?175:260,idx=i<8?i:i-8,total=i<8?Math.min(8,others.length):Math.max(1,others.length-8),a=(Math.PI*2*idx/total)-Math.PI/2;pos.set(n.id,{x:cx+ring*Math.cos(a),y:cy+ring*Math.sin(a)});});
    const palette={issue:'#075985',actor:'#7c3aed',institution:'#1d4ed8',law:'#0f766e',mechanism:'#b45309',outcome:'#be123c',value:'#4338ca',evidence:'#4d7c0f',counter:'#b91c1c',intervention:'#0369a1'};
    const lines=edges.map(e=>{const a=pos.get(e.source),b=pos.get(e.target);if(!a||!b)return'';const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;return`<g><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="network-edge"/><text x="${mx}" y="${my-5}" class="network-edge-label">${safe(e.label||'')}</text></g>`;}).join('');
    const circles=nodes.map(n=>{const p=pos.get(n.id),r=Math.min(42,18+Number(n.weight||2)*2),color=palette[n.type]||'#475569',label=String(n.label||'');const wrapped=label.length>14?[label.slice(0,14),label.slice(14,28)]:[label];return`<g class="network-node" tabindex="0"><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${color}"><title>${safe(TYPE_LABELS[n.type]||n.type)}：${safe(label)}${n.source_ids?.length?`｜來源 ${safe(n.source_ids.join(', '))}`:''}</title></circle>${wrapped.map((x,j)=>`<text x="${p.x}" y="${p.y+(j-(wrapped.length-1)/2)*15}" text-anchor="middle">${safe(x)}</text>`).join('')}</g>`;}).join('');
    container.innerHTML=`<svg class="concept-network" viewBox="0 0 ${width} ${height}" role="img" aria-label="議題概念關聯網絡">${lines}${circles}</svg><p class="muted">${safe(graph.notice||'')}</p>`;
  }
  return{fallbackGraph,render,TYPE_LABELS};
});
