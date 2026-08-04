#!/usr/bin/env python3
"""資料分級與外部模型外送閘門。"""
from __future__ import annotations
import re
from dataclasses import dataclass, asdict

PHONE = re.compile(r"(?<!\d)(?:\+?886[- ]?)?0?9\d{2}[- ]?\d{3}[- ]?\d{3}(?!\d)")
NATIONAL_ID = re.compile(r"(?<![A-Z0-9])[A-Z][12]\d{8}(?!\d)", re.I)
EMAIL = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
MEDICAL = re.compile(r"病歷|診斷|用藥|醫療紀錄|自殺|精神疾病|身心障礙")
CASE_DATA = re.compile(r"陳情人|當事人|個案姓名|住址|身分證|電話|病歷號")

@dataclass
class Classification:
    level: str
    external_model_allowed: bool
    reasons: list[str]

    def to_dict(self) -> dict:
        return asdict(self)

def classify(text: str, source_type: str = "unknown", declared_public: bool = False) -> Classification:
    text = text or ""
    reasons: list[str] = []
    if NATIONAL_ID.search(text): reasons.append("疑似身分證統一編號")
    if PHONE.search(text): reasons.append("疑似行動電話")
    if EMAIL.search(text): reasons.append("疑似電子郵件")
    if MEDICAL.search(text): reasons.append("疑似醫療或高度敏感內容")
    if CASE_DATA.search(text): reasons.append("疑似具體個案資料")
    if reasons:
        return Classification("restricted_personal_or_sensitive", False, reasons)
    if source_type in {"official_api", "official_document"} and declared_public:
        return Classification("public_official", True, ["公開官方資料"])
    if declared_public:
        return Classification("public_nonofficial", True, ["公開資料，但須另查來源權威性"])
    return Classification("internal_or_unknown", False, ["公開性或資料權限未確認"])

def assert_external_allowed(text: str, source_type: str, declared_public: bool) -> None:
    result = classify(text, source_type, declared_public)
    if not result.external_model_allowed:
        raise ValueError("資料政策阻擋外送：" + "、".join(result.reasons))
