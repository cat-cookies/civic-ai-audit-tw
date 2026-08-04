'use strict';

(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivicLegislation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function splitSources(value) {
    return String(value || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  }

  function reasons(data, emphasis) {
    return [
      `現行制度問題：${clean(data.problem) || '尚待具體化。'}`,
      `政策目的：${clean(data.goal) || '尚待具體化。'}`,
      `修正手段：${emphasis}`,
      '法制檢查：確認法律保留、明確性、比例原則、正當程序、救濟及授權範圍。',
      '執行檢查：確認主管機關、人力、財政、資訊系統、中央地方分工及施行過渡。',
    ];
  }

  function placeholderText(data, versionName, strategy) {
    const current = clean(data.current_text);
    if (!current) {
      return `【${versionName}條文待擬】未提供現行條文，系統不虛構法條。建議依「${strategy}」逐句修正，並核對全國法規資料庫與立法沿革。`;
    }
    return `【${versionName}稿框架】以現行條文為底稿，僅就「${strategy}」相關文字進行修正；未經 AI 或人工逐句核對前，不視為正式條文。`;
  }

  function buildDrafts(data) {
    const law = clean(data.law);
    const article = clean(data.article);
    const current = clean(data.current_text) || '【未提供；請核對現行有效條文後貼入】';
    const common = {
      law,
      article,
      title: `${law}${article}條文修正草案`,
      issue: clean(data.problem),
      goal: clean(data.goal),
      proposedDirection: clean(data.change),
      sources: splitSources(data.sources),
      generatedAt: new Date().toISOString(),
      status: '規則式策略草稿；須人工或 AI 逐句修訂',
    };

    const versions = [
      {
        id: 'A',
        name: '版本A：最小修正',
        strategy: '只處理最明確的規範缺口，盡量維持現行制度與文字結構',
        amendedText: placeholderText(data, '最小修正', '明確缺口與必要文字'),
        currentText: current,
        reasons: reasons(data, '採最小必要修正，降低法制連動、財政及執行成本。'),
        benefits: ['修法幅度較小', '較易與現行體系銜接', '施行與教育訓練成本較低'],
        risks: ['可能只處理表面症狀', '若問題源自流程或資源，效果可能有限'],
        implementation: '以既有主管機關及程序為主，補充必要要件、期限或義務。',
        fiscalImpact: '原則上較低；仍須估算行政作業、資訊系統與教育訓練成本。',
      },
      {
        id: 'B',
        name: '版本B：權衡修正',
        strategy: '同時處理權利義務、主管機關權限、程序保障與執行責任',
        amendedText: placeholderText(data, '權衡修正', '實體規範、程序保障與執行責任'),
        currentText: current,
        reasons: reasons(data, '在政策效果、權利保障與行政可行性間取得平衡。'),
        benefits: ['規範較完整', '可降低執行落差', '較能回應權利保障與責任分工'],
        risks: ['條文複雜度提高', '主管機關可能需要增補人力與作業程序'],
        implementation: '明定主體、要件、程序、期限、紀錄、通知、救濟及必要授權。',
        fiscalImpact: '中度；須進行法規影響評估、地方財政與人力盤點。',
      },
      {
        id: 'C',
        name: '版本C：制度性修正',
        strategy: '除核心條文外，納入跨機關協作、資料治理、定期評估與配套修法',
        amendedText: placeholderText(data, '制度性修正', '核心規範、跨機關配套、評估與問責'),
        currentText: current,
        reasons: reasons(data, '將單一規範缺口提升為制度性治理與持續評估機制。'),
        benefits: ['可處理系統性成因', '建立持續評估與修正能力', '提升跨機關一致性'],
        risks: ['修法與協調成本最高', '可能需要多條併修、預算及資訊治理配套'],
        implementation: '盤點關聯法規，建立權責、資料、預算、報告、績效指標與定期檢討機制。',
        fiscalImpact: '較高；應附財政影響、組織能力、資訊系統與分階段施行規劃。',
      },
    ];

    return {
      ...common,
      versions,
      sharedChecks: [
        '現行法規、沿革、施行日期及主管機關權限是否已核對。',
        '問題是否有官方資料、統計、審計、裁判或實務紀錄支持。',
        '是否比較維持現狀、行政措施、預算工具、資訊揭露及修法等替代方案。',
        '是否進行人權、性別、財政、地方自治與執行影響評估。',
        '是否設計過渡期、子法期限、績效指標及定期檢討。',
      ],
    };
  }

  function normalizeAIResult(value, fallback) {
    if (!value || typeof value !== 'object') return fallback;
    if (!Array.isArray(value.versions) || value.versions.length < 2) return fallback;
    return {
      ...fallback,
      ...value,
      versions: value.versions.slice(0, 3).map((version, index) => ({
        ...fallback.versions[Math.min(index, fallback.versions.length - 1)],
        ...version,
        reasons: Array.isArray(version.reasons) ? version.reasons : [String(version.reasons || '')].filter(Boolean),
        benefits: Array.isArray(version.benefits) ? version.benefits : [String(version.benefits || '')].filter(Boolean),
        risks: Array.isArray(version.risks) ? version.risks : [String(version.risks || '')].filter(Boolean),
      })),
    };
  }

  return { buildDrafts, normalizeAIResult };
});
