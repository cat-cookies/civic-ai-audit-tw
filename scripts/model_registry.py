#!/usr/bin/env python3
"""動態發現可用免費模型。未知價格、政策過期或供應商未核准時一律停用。"""
from __future__ import annotations
import argparse, datetime as dt, json, os, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load_config() -> dict:
    return json.loads((ROOT / "config/models.json").read_text(encoding="utf-8"))

def get_json(url: str, headers: dict[str, str] | None = None, timeout: int = 15) -> dict:
    req = urllib.request.Request(url, headers=headers or {"User-Agent":"civic-ai-audit/2.0"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)

def assertion_fresh(provider: dict, max_age: int) -> bool:
    date = provider.get("free_assertion", {}).get("checked_at")
    if not date: return False
    checked = dt.date.fromisoformat(date)
    return (dt.date.today() - checked).days <= max_age

def discover(provider: dict, policy: dict) -> dict:
    result = {"provider":provider["id"], "eligible":[], "status":"disabled", "reason":""}
    required = provider.get("enabled_if_env", [])
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        result.update(status="not_configured", reason="缺少環境變數：" + ", ".join(missing)); return result
    if provider["id"] != "ollama" and not assertion_fresh(provider, int(policy.get("free_assertion_max_age_days", 35))):
        result.update(status="blocked", reason="免費狀態查核已過期，依 fail-closed 政策停用"); return result
    try:
        ptype = provider.get("type")
        if ptype == "gemini_dynamic":
            key = os.environ["GEMINI_API_KEY"]
            payload = get_json(provider["discovery_url"] + "?key=" + urllib.parse.quote(key))
            names = {m.get("name", "").removeprefix("models/") for m in payload.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])}
            result["eligible"] = [m for m in provider.get("candidate_models", []) if m in names and m in provider.get("free_assertion",{}).get("eligible_candidates",[])]
        elif ptype == "openai_dynamic":
            payload = get_json(provider["base_url"] + provider.get("discovery_path", "/models"), {"Authorization":"Bearer " + os.environ["GROQ_API_KEY"]})
            names = {m.get("id") for m in payload.get("data", [])}
            blocked = tuple(provider.get("blocked_prefixes", []))
            result["eligible"] = [m for m in provider.get("candidate_models", []) if m in names and not m.startswith(blocked)]
        elif ptype == "openrouter_zero_price_dynamic":
            payload = get_json(provider["base_url"] + "/models", {"Authorization":"Bearer " + os.environ["OPENROUTER_API_KEY"]})
            preferred = tuple(provider.get("preferred_model_prefixes", [])); blocked = tuple(provider.get("blocked_model_prefixes", []))
            for m in payload.get("data", []):
                mid = str(m.get("id", "")); pricing = m.get("pricing", {})
                try: free = float(pricing.get("prompt", "nan")) == 0 and float(pricing.get("completion", "nan")) == 0
                except (TypeError, ValueError): free = False
                if free and mid.startswith(preferred) and not mid.startswith(blocked): result["eligible"].append(mid)
        elif ptype == "cloudflare_dynamic":
            # Cloudflare 沒有穩定的帳戶模型清單契約；只保留預先核准候選，實際呼叫逐一健康檢查。
            result["eligible"] = provider.get("candidate_models", [])
        elif ptype == "ollama_dynamic":
            payload = get_json(provider.get("base_url", "http://127.0.0.1:11434") + "/api/tags")
            names = {m.get("name") for m in payload.get("models", [])}
            requested = os.environ.get("OLLAMA_MODEL", "")
            result["eligible"] = [requested] if requested in names else []
        result["status"] = "ready" if result["eligible"] else "no_eligible_model"
        result["reason"] = "僅列出符合預先核准、零價格或本機條件的模型" if result["eligible"] else "沒有符合條件的模型"
    except Exception as exc:  # network failure must not turn into paid fallback
        result.update(status="unavailable", reason=f"探索失敗：{type(exc).__name__}: {exc}")
    return result

def main() -> int:
    parser=argparse.ArgumentParser(); parser.add_argument("--output", default=str(ROOT/"data/model-status.json")); args=parser.parse_args()
    cfg=load_config(); results=[discover(p,cfg["policy"]) for p in cfg.get("providers",[])];
    out={"schema_version":"2.0","checked_at":dt.datetime.now(dt.timezone.utc).isoformat(),"paid_fallback_allowed":False,"providers":results}
    Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(out,ensure_ascii=False,indent=2)); return 0
if __name__ == "__main__": raise SystemExit(main())
