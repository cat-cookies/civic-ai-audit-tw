#!/usr/bin/env python3
"""主張—證據矩陣驗證。模型引文必須真的存在於保存來源。"""
from __future__ import annotations
from dataclasses import dataclass, asdict

@dataclass
class EvidenceCheck:
    valid: bool
    normalized_quote: str
    reason: str

    def to_dict(self) -> dict:
        return asdict(self)

def normalize_quote(text: str) -> str:
    return " ".join((text or "").replace("\u3000", " ").split())

def validate_quote(source_text: str, quoted_span: str) -> EvidenceCheck:
    source = normalize_quote(source_text)
    quote = normalize_quote(quoted_span)
    if not quote:
        return EvidenceCheck(False, quote, "引文為空")
    if len(quote) < 8:
        return EvidenceCheck(False, quote, "引文過短，無法可靠定位")
    if quote not in source:
        return EvidenceCheck(False, quote, "引文未逐字存在於保存來源")
    return EvidenceCheck(True, quote, "引文已在保存來源中逐字驗證")

def validate_matrix(source_by_id: dict[str, str], matrix: list[dict]) -> list[dict]:
    output = []
    for item in matrix:
        source_id = str(item.get("source_id", ""))
        check = validate_quote(source_by_id.get(source_id, ""), str(item.get("quoted_span", "")))
        row = dict(item)
        row["quote_validation"] = check.to_dict()
        output.append(row)
    return output
