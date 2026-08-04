from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def load(name: str, fallback: Any) -> Any:
    path = DATA / name
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def compact(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(compact(v) for v in value.values())
    if isinstance(value, list):
        return " ".join(compact(v) for v in value)
    return str(value)


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").casefold()
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", " ", value).strip()


def make_doc(kind: str, ident: str, title: str, body: str, url: str = "", tags: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    searchable = normalize(" ".join([title, body, " ".join(tags or [])]))
    return {
        "id": f"{kind}:{ident}",
        "kind": kind,
        "title": title,
        "body": body,
        "url": url,
        "tags": tags or [],
        "searchable": searchable,
        **extra,
    }


def main() -> int:
    docs: list[dict[str, Any]] = []
    for idx, source in enumerate(load("sources.json", [])):
        title = source.get("name", "未命名官方入口")
        body = " ".join(str(source.get(k, "")) for k in ("country", "agency", "portal_category", "category", "data", "best_for", "limitations"))
        docs.append(make_doc(
            "official_source", str(idx), title, body, source.get("url", ""),
            [source.get("country", ""), source.get("agency", ""), source.get("portal_category", source.get("category", "")), source.get("level", "")],
            agency=source.get("agency", ""), country=source.get("country", ""), country_code=source.get("country_code", ""), category=source.get("portal_category", source.get("category", "")), level=source.get("level", ""), official=True,
        ))

    for item in load("analyses.json", []):
        body = compact({k: item.get(k) for k in ("domain", "summary", "reform_need", "question_targets", "legal_policy_split", "theory_comparison", "limitations")})
        docs.append(make_doc(
            "analysis", item.get("id", "unknown"), item.get("title", "未命名分析"), body, f"#reform?id={item.get('id', 'unknown')}",
            [item.get("domain", ""), item.get("evidence_grade", ""), item.get("publication_status", "")],
            publication_status=item.get("publication_status", "draft"), evidence_grade=item.get("evidence_grade", "D"),
            human_reviewed=bool(item.get("human_reviewed")), official=False,
        ))

    parties = load("party_positions.json", {}).get("parties", [])
    for party in parties:
        for idx, position in enumerate(party.get("positions", [])):
            body = compact(position)
            docs.append(make_doc(
                "party_position", f"{party.get('id')}:{idx}", f"{party.get('name')}：{position.get('issue', '未分類議題')}", body,
                position.get("source_url", party.get("official_url", "")), [party.get("name", ""), position.get("issue", "")],
                party=party.get("name", ""), official_claim=True,
            ))

    for idx, theory in enumerate(load("theory_catalog.json", [])):
        ident = theory.get("id", str(idx))
        docs.append(make_doc(
            "theory", ident, theory.get("name", "未命名理論"), compact(theory), f"#theory?theory={ident}",
            [theory.get("category", ""), *theory.get("keywords", [])], category=theory.get("category", ""), official=False, peer_reviewed=True,
        ))

    for idx, item in enumerate(load("literature_catalog.json", [])):
        ident = item.get("id", str(idx))
        docs.append(make_doc(
            "literature", ident, item.get("title", "未命名文獻"), compact(item), f"#theory?lit={ident}",
            [item.get("journal", ""), str(item.get("year", "")), *item.get("domains", []), *item.get("keywords", [])],
            official=False, peer_reviewed=bool(item.get("peer_reviewed")), doi=item.get("doi", ""), year=item.get("year", ""),
        ))

    for idx, method in enumerate(load("research_methods.json", [])):
        docs.append(make_doc(
            "research_method", method.get("id", str(idx)), method.get("name", "未命名研究方法"), compact(method), "#compare",
            method.get("triggers", []), official=False,
        ))

    # 固定的法律研究導引，不聲稱取得特定條文全文。
    law_guides = [
        ("全國法規資料庫", "確認現行中央法規、法規沿革、公布與施行日期。", "https://law.moj.gov.tw/"),
        ("立法院議事暨公報資訊網", "追查提案、一讀、委員會審查、協商、二讀、三讀與議事紀錄。", "https://ppg.ly.gov.tw/ppg/"),
        ("立法院法律系統", "追查法律制定修正沿革與立法資料。", "https://lis.ly.gov.tw/lglawc/lglawkm"),
        ("行政院公報資訊網", "核對法規命令、行政規則、預告與正式公告。", "https://gazette.nat.gov.tw/"),
        ("總統府公報", "核對法律公布與總統令。", "https://www.president.gov.tw/Page/129"),
    ]
    for idx, (title, body, url) in enumerate(law_guides):
        docs.append(make_doc("law_guide", str(idx), title, body, url, ["法律", "法條", "現行法", "立法歷程"], official=True))

    docs.sort(key=lambda x: (x["kind"], x["title"]))
    payload = {
        "schema_version": "5.0",
        "built_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
        "document_count": len(docs),
        "documents": docs,
    }
    canonical = json.dumps(payload["documents"], ensure_ascii=False, sort_keys=True).encode("utf-8")
    payload["documents_sha256"] = hashlib.sha256(canonical).hexdigest()
    (DATA / "search-index.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"built {len(docs)} search documents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
