#!/usr/bin/env python3
"""動態探索候選模型；只做可用性與零價格檢查，不推定帳戶永久免費。"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOCKED = ("deepseek/", "qwen/", "z-ai/", "moonshotai/", "minimax/", "baidu/", "tencent/", "01-ai/", "thudm/", "stepfun/")
ALLOWED = ("google/", "meta-llama/", "mistralai/", "openai/", "nvidia/", "microsoft/", "cohere/", "ai21/")


def get_json(url: str, headers: dict[str, str] | None = None, timeout: int = 18) -> dict:
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "civic-ai-audit/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def openrouter() -> dict:
    key = os.getenv("OPENROUTER_API_KEY", "")
    if not key:
        return {"provider": "openrouter", "status": "not_configured", "eligible": [], "reason": "缺少 OPENROUTER_API_KEY"}
    try:
        payload = get_json("https://openrouter.ai/api/v1/models", {"Authorization": f"Bearer {key}"})
        items = []
        for model in payload.get("data", []):
            model_id = str(model.get("id", ""))
            pricing = model.get("pricing") or {}
            try:
                free = float(pricing.get("prompt", "nan")) == 0 and float(pricing.get("completion", "nan")) == 0
            except (TypeError, ValueError):
                free = False
            if free and model_id.startswith(ALLOWED) and not model_id.startswith(BLOCKED):
                items.append(model_id)
        return {"provider": "openrouter", "status": "ready" if items else "no_eligible_model", "eligible": items[:30], "reason": "僅保留輸入與輸出價格均為零且通過開發者白名單的模型"}
    except Exception as exc:
        return {"provider": "openrouter", "status": "unavailable", "eligible": [], "reason": f"{type(exc).__name__}: {exc}"}


def gemini() -> dict:
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        return {"provider": "gemini", "status": "not_configured", "eligible": [], "reason": "缺少 GEMINI_API_KEY"}
    try:
        payload = get_json("https://generativelanguage.googleapis.com/v1beta/models?key=" + urllib.parse.quote(key))
        items = [str(model.get("name", "")).removeprefix("models/") for model in payload.get("models", []) if "generateContent" in (model.get("supportedGenerationMethods") or []) and any(token in str(model.get("name", "")).lower() for token in ("flash", "lite"))]
        return {"provider": "gemini", "status": "account_check_required" if items else "no_eligible_model", "eligible": items[:30], "reason": "模型可用；免費額度仍須依 Google 專案與當日配額確認"}
    except Exception as exc:
        return {"provider": "gemini", "status": "unavailable", "eligible": [], "reason": f"{type(exc).__name__}: {exc}"}


def groq() -> dict:
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        return {"provider": "groq", "status": "not_configured", "eligible": [], "reason": "缺少 GROQ_API_KEY"}
    try:
        payload = get_json("https://api.groq.com/openai/v1/models", {"Authorization": f"Bearer {key}"})
        items = [str(model.get("id", "")) for model in payload.get("data", []) if model.get("id") and not str(model.get("id")).startswith(BLOCKED)]
        return {"provider": "groq", "status": "account_check_required" if items else "no_eligible_model", "eligible": items[:30], "reason": "模型可用；開發額度與限流須依 Groq 帳戶確認"}
    except Exception as exc:
        return {"provider": "groq", "status": "unavailable", "eligible": [], "reason": f"{type(exc).__name__}: {exc}"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(ROOT / "data/model-status.json"))
    args = parser.parse_args()
    results = [openrouter(), gemini(), groq()]
    out = {
        "schema_version": "5.0",
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "paid_fallback_allowed": False,
        "providers": results,
    }
    Path(args.output).write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
