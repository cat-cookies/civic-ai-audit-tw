#!/usr/bin/env python3
from __future__ import annotations
import json, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/"_site"
PUBLIC_FILES=["index.html","styles.css","search.js","academic.js","legislation.js","xlsx-export.js","ai-engine.js","political-analysis.js","app.js","DISCLAIMER.md","SECURITY.md","LICENSE","VERSION"]
PUBLIC_DATA=["sources.json","analyses.json","party_positions.json","theory_catalog.json","literature_catalog.json","concept_ontology.json","methodology.json","search-index.json","model-status.json","connector-status.json","jurisdictions.json","research_methods.json","curiosity_examples.json","party_source_registry.json","party_ideology_profiles.json","media_methodology.json","media_ownership_registry.json","comparative_applicability.json"]

def main() -> int:
    if OUT.exists(): shutil.rmtree(OUT)
    OUT.mkdir()
    for name in PUBLIC_FILES:
        src=ROOT/name
        if src.exists(): shutil.copy2(src,OUT/name)
    # GitHub 網頁上傳可能漏掉點開頭檔案；公開站建置時一律建立 .nojekyll。
    (OUT/".nojekyll").write_text("", encoding="utf-8")
    (OUT/"data").mkdir(); (OUT/"config").mkdir(); (OUT/"examples").mkdir()
    for name in PUBLIC_DATA:
        src=ROOT/"data"/name
        if src.exists(): shutil.copy2(src,OUT/"data"/name)
    for name in ["party_social_import_template.csv", "media_corpus_template.csv"]:
        src=ROOT/"examples"/name
        if src.exists(): shutil.copy2(src,OUT/"examples"/name)
    runtime=json.loads((ROOT/"config/runtime.json").read_text(encoding="utf-8")); runtime["enable_remote_ai"]=False if not runtime.get("public_api_base_url") else bool(runtime.get("enable_remote_ai"))
    (OUT/"config/runtime.json").write_text(json.dumps(runtime,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"built {OUT}"); return 0
if __name__=="__main__": raise SystemExit(main())
