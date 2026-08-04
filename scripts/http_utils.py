#!/usr/bin/env python3
from __future__ import annotations
import datetime as dt, hashlib, json, urllib.request
from dataclasses import dataclass, asdict

@dataclass
class FetchRecord:
    requested_url: str
    final_url: str
    fetched_at_utc: str
    http_status: int
    content_type: str
    content_length: int
    etag: str
    last_modified: str
    raw_sha256: str
    parsed_sha256: str | None
    connector_version: str
    parser_version: str

def fetch(url: str, timeout: int = 30, connector_version: str = "2.0", parser_version: str = "2.0") -> tuple[bytes, dict]:
    req=urllib.request.Request(url,headers={"User-Agent":"civic-ai-audit/2.0","Accept":"application/json,text/plain,*/*"})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        raw=r.read(); parsed_hash=None
        if "json" in (r.headers.get("Content-Type") or ""):
            try:
                canonical=json.dumps(json.loads(raw),ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()
                parsed_hash=hashlib.sha256(canonical).hexdigest()
            except Exception: pass
        record=FetchRecord(url,r.geturl(),dt.datetime.now(dt.timezone.utc).isoformat(),r.status,r.headers.get("Content-Type",""),len(raw),r.headers.get("ETag",""),r.headers.get("Last-Modified",""),hashlib.sha256(raw).hexdigest(),parsed_hash,connector_version,parser_version)
        return raw,asdict(record)
