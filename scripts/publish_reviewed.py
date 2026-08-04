#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
try:
    from .validators import publication_findings
except ImportError:
    from validators import publication_findings
ROOT=Path(__file__).resolve().parents[1]

def main() -> int:
    ap=argparse.ArgumentParser(); ap.add_argument("input"); ap.add_argument("--output",default=str(ROOT/"data/analyses.json")); args=ap.parse_args()
    items=json.loads(Path(args.input).read_text(encoding="utf-8")); approved=[]; blocked=[]
    for item in items:
        findings=publication_findings(item)
        (blocked if findings else approved).append({**item,"publication_findings":findings})
    Path(args.output).write_text(json.dumps(approved,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"approved":len(approved),"blocked":len(blocked),"blocked_items":blocked},ensure_ascii=False,indent=2))
    return 0 if not blocked else 3
if __name__=="__main__": raise SystemExit(main())
