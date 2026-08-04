from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, asdict
from typing import Any

LAW_SUFFIXES = (
    "自治條例", "施行細則", "施行法", "組織法", "條例", "通則", "規則", "辦法", "準則", "標準", "細則", "法"
)
CHINESE_DIGITS = {"零": 0, "〇": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
CHINESE_UNITS = {"十": 10, "百": 100, "千": 1000, "萬": 10000}


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKC", value or "").strip()
    text = re.sub(r"[\s　]+", " ", text)
    return text


def chinese_number_to_int(value: str) -> int | None:
    value = normalize_text(value).replace("第", "").replace("條", "")
    if value.isdigit():
        return int(value)
    if not value or any(ch not in CHINESE_DIGITS and ch not in CHINESE_UNITS for ch in value):
        return None
    total = 0
    current = 0
    section = 0
    for ch in value:
        if ch in CHINESE_DIGITS:
            current = CHINESE_DIGITS[ch]
        else:
            unit = CHINESE_UNITS[ch]
            if unit == 10000:
                section = (section + current) * unit
                total += section
                section = 0
                current = 0
            else:
                section += (current or 1) * unit
                current = 0
    return total + section + current


@dataclass
class QueryRoute:
    mode: str
    raw_query: str
    normalized_query: str
    law_name: str = ""
    article_text: str = ""
    article_number: int | None = None
    subarticle_number: int | None = None
    confidence: float = 0.0
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def parse_article_token(token: str) -> tuple[int | None, int | None]:
    token = normalize_text(token).replace(" ", "")
    parts = re.split(r"(?:之|-)", token, maxsplit=1)
    first = chinese_number_to_int(parts[0])
    second = chinese_number_to_int(parts[1]) if len(parts) > 1 else None
    return first, second


def detect_query_route(query: str) -> QueryRoute:
    raw = query or ""
    q = normalize_text(raw)
    suffix_pattern = "|".join(sorted((re.escape(x) for x in LAW_SUFFIXES), key=len, reverse=True))
    article_token = r"[0-9零〇一二兩三四五六七八九十百千萬]+(?:\s*(?:之|-)\s*[0-9零〇一二兩三四五六七八九十百千萬]+)?"
    pattern = re.compile(
        rf"(?P<law>[\u4e00-\u9fffA-Za-z0-9·・（）()\-]{{2,45}}?(?:{suffix_pattern}))\s*第\s*(?P<article>{article_token})\s*條"
    )
    match = pattern.search(q)
    if match:
        law = re.sub(r"^(請問|查詢|搜尋|查|找|關於)", "", match.group("law")).strip(" ：:，,。")
        article = match.group("article")
        first, second = parse_article_token(article)
        return QueryRoute(
            mode="exact_law",
            raw_query=raw,
            normalized_query=q,
            law_name=law,
            article_text=f"第{article}條",
            article_number=first,
            subarticle_number=second,
            confidence=0.99,
            reason="偵測到完整法規名稱與條次。",
        )

    # 條次明確但法名可能省略，仍標為法律導向搜尋，而不是讓模型猜。
    article_only = re.search(rf"第\s*(?P<article>{article_token})\s*條", q)
    if article_only:
        first, second = parse_article_token(article_only.group("article"))
        return QueryRoute(
            mode="law_article_ambiguous",
            raw_query=raw,
            normalized_query=q,
            article_text=f"第{article_only.group('article')}條",
            article_number=first,
            subarticle_number=second,
            confidence=0.72,
            reason="偵測到條次，但未可靠辨識完整法規名稱；只做法律資料篩選，不補猜法名。",
        )

    law_name_match = re.search(rf"([\u4e00-\u9fffA-Za-z0-9·・（）()\-]{{2,45}}?(?:{suffix_pattern}))", q)
    if law_name_match:
        return QueryRoute(
            mode="law_name",
            raw_query=raw,
            normalized_query=q,
            law_name=law_name_match.group(1),
            confidence=0.82,
            reason="偵測到法規名稱，但沒有條次。",
        )

    return QueryRoute(
        mode="fuzzy",
        raw_query=raw,
        normalized_query=q,
        confidence=0.7 if q else 0.0,
        reason="未偵測到明確法規名稱與條次，採可重現的模糊關鍵字搜尋。",
    )
