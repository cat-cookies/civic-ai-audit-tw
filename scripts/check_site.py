#!/usr/bin/env python3
from __future__ import annotations
import json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/"_site"

def main() -> int:
    errors=[]
    for f in ["index.html","search.js","legislation.js","xlsx-export.js","ai-engine.js","app.js","styles.css","data/search-index.json","data/curiosity_examples.json","config/runtime.json"]:
        if not (OUT/f).exists(): errors.append(f"缺少 {f}")
    html=(OUT/"index.html").read_text(encoding="utf-8") if (OUT/"index.html").exists() else ""
    if "人工智慧生成內容警示" not in html: errors.append("缺少固定 AI 警示")
    forbidden=["data/raw","data/private","review","config/models.json",".env"]
    paths=[str(p.relative_to(OUT)) for p in OUT.rglob("*")]
    for token in forbidden:
        if any(token in p for p in paths): errors.append(f"公開站包含禁止路徑 {token}")
    for p in OUT.rglob("*.json"):
        try: json.loads(p.read_text(encoding="utf-8"))
        except Exception as exc: errors.append(f"JSON錯誤 {p}: {exc}")
    if re.search(r"(?:AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z]{20,})", "\n".join(p.read_text(encoding="utf-8",errors="ignore") for p in OUT.rglob("*.*"))): errors.append("疑似API金鑰")
    print("OK" if not errors else "\n".join(errors)); return 0 if not errors else 1
if __name__=="__main__": raise SystemExit(main())
