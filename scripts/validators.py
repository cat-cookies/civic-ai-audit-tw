#!/usr/bin/env python3
from __future__ import annotations
import re
try:
    from .data_policy import classify
except ImportError:
    from data_policy import classify

HIGH_RISK = re.compile(r"貪污|貪腐|造假|犯罪|圖利|瀆職|違法|共犯|收賄|偽造|失職")
CONFIRMED_MARKERS = re.compile(r"確定判決|正式處分|監察院彈劾案文|權責機關正式認定")

def publication_findings(item: dict) -> list[str]:
    findings: list[str] = []
    text = " ".join(str(item.get(k, "")) for k in ("title", "summary", "conclusion", "body"))
    cls = classify(text, source_type=str(item.get("source_type", "unknown")), declared_public=bool(item.get("declared_public")))
    if not cls.external_model_allowed and cls.level != "internal_or_unknown":
        findings.append("包含疑似個資或敏感資料")
    if HIGH_RISK.search(text) and not CONFIRMED_MARKERS.search(text):
        findings.append("包含高風險法律定性，但未標示確定裁判或正式權責機關認定")
    if item.get("evidence_grade") not in {"A", "B"}:
        findings.append("證據等級不足以自動公開")
    if not item.get("human_reviewed"):
        findings.append("尚未完成人工覆核")
    if item.get("high_risk") and len(item.get("approvals", [])) < 2:
        findings.append("高風險內容未完成雙人核准")
    return findings
