'use strict';

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivicAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const BLOCKED_PREFIXES = ['deepseek/', 'qwen/', 'z-ai/', 'moonshotai/', 'minimax/', 'baidu/', 'tencent/', '01-ai/', 'thudm/', 'stepfun/'];
  const ALLOWED_PREFIXES = ['google/', 'meta-llama/', 'mistralai/', 'openai/', 'nvidia/', 'microsoft/', 'cohere/', 'ai21/'];

  const schemas = {
    research: {
      type: 'object',
      required: ['question_type', 'research_question', 'findings', 'legal_policy_split', 'methods', 'limitations'],
    },
    legislation: {
      type: 'object',
      required: ['versions', 'sharedChecks'],
    },
  };

  function safeJson(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const candidates = [raw, raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()];
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
    for (const candidate of candidates) {
      try { return JSON.parse(candidate); } catch { /* continue */ }
    }
    return null;
  }

  function sensitiveText(text) {
    return /[A-Z][12]\d{8}|(?:\+?886[- ]?)?0?9\d{2}[- ]?\d{3}[- ]?\d{3}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|病歷號|身分證|護照號碼|完整住址/.test(String(text));
  }

  function systemPrompt(task, stage, mode) {
    const common = `你是中華民國公共政策、立法學、行政法、比較法、實證研究與風險治理的審慎研究助理。\n
硬性規則：\n1. 只能使用輸入中明示的資料、來源摘要與網址，不得捏造法條、裁判、統計、引文或機關立場。\n2. 明確區分事實、法律形成、政策形成、政治／議事過程、執行與價值判斷。\n3. 法律問題須檢查法源位階、行為時法、法律保留、明確性、比例原則、程序與救濟。\n4. 政策問題須列替代方案、成本、執行能力、分配效果、替代解釋與不能證明的事項。\n5. 跨國比較採功能比較法，說明選國理由及不可直接移植之處。\n6. 模型一致不是證據；來源層級、效力、日期及可重現性優先。\n7. 不得認定任何個人或組織犯罪、違法、貪腐、造假或失職。\n8. 使用繁體中文。`;
    const stageRule = {
      planner: '你只負責拆解問題、辨識資料缺口與選擇最省資源的研究路徑。不要寫長篇結論。',
      critic: '你只負責找出證據不足、概念混淆、因果跳躍、法律效力誤認、比較法不可比與高風險表述。',
      synth: '你負責整合已提供的規劃與批判，形成可供公民或研究者使用的結構化草稿。',
      single: '在一次回覆中完成問題拆解、證據評估、方法選擇、反方檢查與綜合。',
    }[stage] || '';
    const taskRule = task === 'legislation'
      ? '修法任務必須提出三種版本：A最小修正、B權衡修正、C制度性修正；每版均含修正條文、現行條文、逐點理由、優點、風險、執行需求與財政影響。未提供現行條文時，不得虛構條文。'
      : '研究任務須輸出：問題類型、核心研究問題、可證明事實、法律與政策分流、替代解釋、研究方法、跨國比較、來源矩陣、限制與信心。';
    return `${common}\n${stageRule}\n${taskRule}\n資源模式：${mode}。輸出只允許 JSON，不要使用 Markdown code fence。`;
  }

  function userPrompt(task, payload, prior = null) {
    return JSON.stringify({
      task,
      payload,
      prior,
      output_contract: task === 'legislation'
        ? {
            versions: [{ id: 'A|B|C', name: '', strategy: '', amendedText: '', currentText: '', reasons: [''], benefits: [''], risks: [''], implementation: '', fiscalImpact: '' }],
            sharedChecks: [''],
            sourceMatrix: [{ claim: '', source: '', support: 'direct|partial|none', limitation: '' }],
          }
        : {
            question_type: 'fact|law|policy|causal|comparative|mixed',
            research_question: '',
            findings: [{ claim: '', evidence: '', source: '', support: 'direct|partial|none', confidence: 'high|medium|low' }],
            legal_policy_split: { law: '', policy: '', politics: '', implementation: '' },
            alternatives: [{ option: '', advantage: '', risk: '' }],
            methods: [{ name: '', why: '', design: '', data_needed: '', limitation: '' }],
            comparative_jurisdictions: [{ jurisdiction: '', selection_reason: '', comparison_dimensions: [''], transfer_limit: '' }],
            counterarguments: [''],
            limitations: [''],
            next_steps: [''],
            confidence: 'high|medium|low',
          },
    }, null, 2);
  }

  async function fetchEligibleModels(cfg) {
    if (cfg.backend_url) {
      const response = await fetch(`${String(cfg.backend_url).replace(/\/$/, '')}/models`, { headers: cfg.backend_token ? { authorization: `Bearer ${cfg.backend_token}` } : {} });
      if (!response.ok) throw new Error(`後端模型清單 ${response.status}`);
      const data = await response.json();
      return (data.models || []).map(item => typeof item === 'string' ? item : `${item.provider}:${item.model}`);
    }
    if (!cfg.key) return [];
    if (cfg.provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/models', { headers: { authorization: `Bearer ${cfg.key}` } });
      if (!response.ok) throw new Error(`OpenRouter 模型清單 ${response.status}`);
      const data = await response.json();
      return (data.data || [])
        .filter(model => {
          const id = String(model.id || '');
          const price = model.pricing || {};
          return Number(price.prompt) === 0 && Number(price.completion) === 0
            && ALLOWED_PREFIXES.some(prefix => id.startsWith(prefix))
            && !BLOCKED_PREFIXES.some(prefix => id.startsWith(prefix));
        })
        .sort((a, b) => Number(b.context_length || 0) - Number(a.context_length || 0))
        .map(model => model.id);
    }
    if (cfg.provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.key)}`);
      if (!response.ok) throw new Error(`Gemini 模型清單 ${response.status}`);
      const data = await response.json();
      return (data.models || [])
        .filter(model => (model.supportedGenerationMethods || []).includes('generateContent'))
        .map(model => String(model.name || '').replace(/^models\//, ''))
        .filter(id => /flash|lite/i.test(id));
    }
    if (cfg.provider === 'groq') {
      const response = await fetch('https://api.groq.com/openai/v1/models', { headers: { authorization: `Bearer ${cfg.key}` } });
      if (!response.ok) throw new Error(`Groq 模型清單 ${response.status}`);
      const data = await response.json();
      return (data.data || [])
        .map(model => String(model.id || ''))
        .filter(id => id && !BLOCKED_PREFIXES.some(prefix => id.startsWith(prefix)));
    }
    return [];
  }

  async function callDirect(cfg, model, system, user, maxTokens) {
    if (cfg.provider === 'openrouter') {
      const body = {
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        provider: { allow_fallbacks: false, data_collection: 'deny', require_parameters: true },
      };
      if (cfg.actual_provider) body.provider.order = [cfg.actual_provider];
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}`, 'HTTP-Referer': location.origin, 'X-Title': 'Civic AI Audit TW' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
    if (cfg.provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
        }),
      });
      if (!response.ok) throw new Error(`Gemini ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    }
    if (cfg.provider === 'groq') {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          temperature: 0.1,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) throw new Error(`Groq ${response.status}`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
    throw new Error('未知供應商');
  }

  async function callBackend(cfg, task, payload, mode) {
    const endpoint = `${String(cfg.backend_url).replace(/\/$/, '')}/api/${task === 'legislation' ? 'legislation' : 'research'}`;
    const rawUrls = [];
    const sourceText = String(payload?.data?.sources || '');
    sourceText.split(/\n+/).forEach(item => { if (/^https?:\/\//i.test(item.trim())) rawUrls.push(item.trim()); });
    (payload?.local_sources || []).forEach(item => { if (item?.url && /^https?:\/\//i.test(item.url)) rawUrls.push(item.url); });
    const source_urls = [...new Set(rawUrls)].slice(0, 6);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.backend_token ? { authorization: `Bearer ${cfg.backend_token}` } : {}),
      },
      body: JSON.stringify({ payload, mode, source_urls }),
    });
    if (!response.ok) throw new Error(`虛擬後端 ${response.status}`);
    return response.json();
  }

  function stagePlan(mode) {
    if (mode === 'critical') return ['planner', 'critic', 'synth'];
    if (mode === 'standard') return ['planner', 'synth'];
    return ['single'];
  }

  async function run({ task = 'research', payload, cfg, mode = 'economy', onProgress = () => {} }) {
    const serialized = JSON.stringify(payload);
    if (sensitiveText(serialized)) throw new Error('偵測到可能的個人資料，已阻擋外送');
    if (cfg.backend_url) {
      onProgress('使用受控虛擬後端處理……');
      return callBackend(cfg, task, payload, mode);
    }
    if (!cfg.key) throw new Error('未設定 API Key 或虛擬後端');
    const models = await fetchEligibleModels(cfg);
    if (!models.length) throw new Error('目前沒有符合條件的免費／開發額度模型');
    const ordered = [cfg.model, ...models.filter(model => model !== cfg.model)].filter(Boolean);
    const stages = stagePlan(mode);
    let prior = null;
    const trace = [];
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index];
      const model = ordered[Math.min(index, ordered.length - 1)];
      const maxTokens = stage === 'planner' ? 650 : stage === 'critic' ? 800 : mode === 'critical' ? 2200 : 1500;
      onProgress(`AI ${index + 1}/${stages.length}：${stage}，模型 ${model}`);
      const raw = await callDirect(cfg, model, systemPrompt(task, stage, mode), userPrompt(task, payload, prior), maxTokens);
      const parsed = safeJson(raw);
      if (!parsed) throw new Error(`${stage} 未回傳有效 JSON`);
      trace.push({ stage, model });
      prior = parsed;
    }
    return { result: prior, trace, mode, schema: schemas[task] || schemas.research };
  }

  return { run, fetchEligibleModels, safeJson, sensitiveText, controlledPolicy: { BLOCKED_PREFIXES, ALLOWED_PREFIXES } };
});
