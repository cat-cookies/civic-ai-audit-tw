#!/usr/bin/env python3
from __future__ import annotations
import datetime as dt, hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
files=[]
for p in sorted(ROOT.rglob('*')):
    if not p.is_file() or any(x in p.parts for x in {'.git','_site','dist','data/raw','data/private'}): continue
    rel=str(p.relative_to(ROOT)); raw=p.read_bytes(); files.append({"type":"file","name":rel,"hashes":[{"alg":"SHA-256","content":hashlib.sha256(raw).hexdigest()}]})
out={"bomFormat":"CycloneDX","specVersion":"1.6","serialNumber":"urn:uuid:civic-ai-audit-v2","version":1,"metadata":{"timestamp":dt.datetime.now(dt.timezone.utc).isoformat(),"component":{"type":"application","name":"civic-ai-audit","version":(ROOT/'VERSION').read_text().strip()}},"components":files}
(ROOT/'SBOM.cdx.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(len(files))
