#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser(); p.add_argument('--owner',required=True); p.add_argument('--repo',default='civic-ai-audit'); a=p.parse_args()
 path=ROOT/'config/runtime.json'; d=json.loads(path.read_text(encoding='utf-8')); d['repository_url']=f'https://github.com/{a.owner}/{a.repo}'; path.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 cfg=ROOT/'.github/ISSUE_TEMPLATE/config.yml'
 if cfg.exists(): cfg.write_text(cfg.read_text(encoding='utf-8').replace('OWNER/civic-ai-audit',f'{a.owner}/{a.repo}'),encoding='utf-8')
 print(d['repository_url'])
if __name__=='__main__': main()
