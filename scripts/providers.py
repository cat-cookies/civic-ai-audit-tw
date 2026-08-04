#!/usr/bin/env python3
"""受控模型呼叫器。只使用 model-status.json 已核准且可用的模型。"""
from __future__ import annotations
import json, os, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

class ProviderError(RuntimeError): pass

def post_json(url: str, payload: dict, headers: dict[str,str] | None=None, timeout: int=60) -> dict:
    data=json.dumps(payload,ensure_ascii=False).encode("utf-8")
    req=urllib.request.Request(url,data=data,method="POST",headers={"Content-Type":"application/json","User-Agent":"civic-ai-audit/2.0",**(headers or {})})
    with urllib.request.urlopen(req,timeout=timeout) as r: return json.load(r)

def load_ready_models() -> list[tuple[str,str]]:
    path=ROOT/"data/model-status.json"
    if not path.exists(): return []
    data=json.loads(path.read_text(encoding="utf-8")); output=[]
    for p in data.get("providers",[]):
        if p.get("status") == "ready": output.extend((p["provider"],m) for m in p.get("eligible",[]))
    return output

def call(provider: str, model: str, system: str, user: str, max_tokens: int=1800) -> dict:
    if provider == "gemini":
        key=os.environ["GEMINI_API_KEY"]
        url=f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
        out=post_json(url,{"systemInstruction":{"parts":[{"text":system}]},"contents":[{"role":"user","parts":[{"text":user}]}],"generationConfig":{"temperature":0.1,"maxOutputTokens":max_tokens,"responseMimeType":"application/json"}})
        text=out["candidates"][0]["content"]["parts"][0]["text"]
        return {"text":text,"provider":"gemini","model":model,"actual_provider":"Google"}
    if provider == "groq":
        out=post_json("https://api.groq.com/openai/v1/chat/completions",{"model":model,"temperature":0.1,"max_tokens":max_tokens,"response_format":{"type":"json_object"},"messages":[{"role":"system","content":system},{"role":"user","content":user}]},{"Authorization":"Bearer "+os.environ["GROQ_API_KEY"]})
        return {"text":out["choices"][0]["message"]["content"],"provider":"groq","model":model,"actual_provider":"Groq"}
    if provider == "openrouter":
        allowed=[x.strip() for x in os.environ["OPENROUTER_ALLOWED_PROVIDER_SLUGS"].split(",") if x.strip()]
        if not allowed: raise ProviderError("OpenRouter 實際供應商白名單為空")
        payload={"model":model,"temperature":0.1,"max_tokens":max_tokens,"response_format":{"type":"json_object"},"messages":[{"role":"system","content":system},{"role":"user","content":user}],"provider":{"order":allowed,"allow_fallbacks":False,"data_collection":"deny","require_parameters":True}}
        out=post_json("https://openrouter.ai/api/v1/chat/completions",payload,{"Authorization":"Bearer "+os.environ["OPENROUTER_API_KEY"],"HTTP-Referer":os.environ.get("SITE_URL","https://example.invalid"),"X-Title":"Civic AI Audit"})
        return {"text":out["choices"][0]["message"]["content"],"provider":"openrouter","model":model,"actual_provider":out.get("provider") or out.get("usage",{}).get("provider") or "record_not_returned"}
    if provider == "cloudflare":
        account=os.environ["CLOUDFLARE_ACCOUNT_ID"]
        out=post_json(f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}",{"messages":[{"role":"system","content":system},{"role":"user","content":user}],"max_tokens":max_tokens,"temperature":0.1},{"Authorization":"Bearer "+os.environ["CLOUDFLARE_AUTH_TOKEN"]})
        text=out.get("result",{}).get("response") or out.get("result",{}).get("text")
        if not text: raise ProviderError("Cloudflare 回應沒有文字")
        return {"text":text,"provider":"cloudflare","model":model,"actual_provider":"Cloudflare Workers AI"}
    if provider == "ollama":
        base=os.environ.get("OLLAMA_BASE_URL","http://127.0.0.1:11434")
        out=post_json(base+"/api/chat",{"model":model,"stream":False,"format":"json","options":{"temperature":0.1,"num_predict":max_tokens},"messages":[{"role":"system","content":system},{"role":"user","content":user}]})
        return {"text":out["message"]["content"],"provider":"ollama","model":model,"actual_provider":"local"}
    raise ProviderError(f"未知供應商 {provider}")
