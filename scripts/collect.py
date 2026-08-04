#!/usr/bin/env python3
"""官方資料擷取器。預設只測試安全的無憑證端點；失敗會記錄，不會捏造資料。"""
from __future__ import annotations
import argparse, datetime as dt, json
from pathlib import Path
try:
    from .http_utils import fetch
except ImportError:
    from http_utils import fetch
ROOT=Path(__file__).resolve().parents[1]

def main() -> int:
    ap=argparse.ArgumentParser(); ap.add_argument("--connector"); ap.add_argument("--limit",type=int,default=5); args=ap.parse_args()
    cfg=json.loads((ROOT/"config/connectors.json").read_text(encoding="utf-8")); rows=[]
    for c in cfg.get("connectors",[]):
        if args.connector and c["id"] != args.connector: continue
        if not c.get("enabled",False): continue
        record={"connector_id":c["id"],"name":c["name"],"attempted_at":dt.datetime.now(dt.timezone.utc).isoformat(),"status":"failed","metadata":None,"error":None}
        try:
            raw,meta=fetch(c["base_url"]); record.update(status="success",metadata=meta)
            outdir=ROOT/"data/raw"/c["id"]; outdir.mkdir(parents=True,exist_ok=True)
            stamp=dt.datetime.now().strftime("%Y%m%dT%H%M%S")
            (outdir/f"{stamp}.bin").write_bytes(raw); (outdir/f"{stamp}.metadata.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        except Exception as exc: record["error"]=f"{type(exc).__name__}: {exc}"
        rows.append(record)
        if len(rows)>=args.limit: break
    report={"schema_version":"2.0","runs":rows}
    (ROOT/"data/connector-status.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2)); return 0 if all(r["status"]=="success" for r in rows) else 2
if __name__=="__main__": raise SystemExit(main())
