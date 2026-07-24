#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, re
from collections import Counter
from pathlib import Path

CATEGORIES={'mathematics','code','planning','tools','causality','calibration','metacognition','comprehension','multimodal','transfer'}

def sha256(data:bytes)->str:return hashlib.sha256(data).hexdigest()
def norm(text:str)->str:return re.sub(r'\s+',' ',text.lower()).strip()

def main():
 p=argparse.ArgumentParser();p.add_argument('--hidden',required=True);p.add_argument('--manifest',required=True);p.add_argument('--report',required=True);a=p.parse_args()
 hidden=Path(a.hidden);manifest_path=Path(a.manifest);report_path=Path(a.report)
 raw=hidden.read_bytes();rows=[json.loads(x) for x in raw.decode().splitlines() if x.strip()]
 errors=[];ids=[];prompts=[];cats=Counter();difficulties=Counter()
 for i,row in enumerate(rows,1):
  for key in ('id','category','difficulty','split','prompt','reference','verifier','content_sha256'):
   if key not in row:errors.append(f'row {i}: missing {key}')
  ids.append(row.get('id'));prompts.append(row.get('prompt',''));cats[row.get('category')]+=1;difficulties[row.get('difficulty')]+=1
  if row.get('split')!='hidden':errors.append(f'row {i}: split not hidden')
  if not row.get('benchmark_excluded_from_training'):errors.append(f'row {i}: training exclusion missing')
  copy=dict(row);expected=copy.pop('content_sha256',None);actual=sha256(json.dumps(copy,separators=(',',':'),ensure_ascii=False).encode())
  if expected!=actual:errors.append(f'row {i}: content hash mismatch')
 if len(rows)!=500:errors.append(f'expected 500 rows, got {len(rows)}')
 if set(cats)!=CATEGORIES:errors.append(f'categories mismatch: {sorted(cats)}')
 for cat in CATEGORIES:
  if cats[cat]!=50:errors.append(f'{cat}: expected 50, got {cats[cat]}')
  values={norm(r['prompt']) for r in rows if r['category']==cat}
  if len(values)<40:errors.append(f'{cat}: insufficient parameterized diversity {len(values)}')
 if len(set(ids))!=len(ids):errors.append('duplicate ids')
 if len(set(prompts))!=len(prompts):errors.append('exact duplicate prompts')
 manifest=json.loads(manifest_path.read_text())
 if manifest.get('total')!=500:errors.append('manifest total mismatch')
 if manifest.get('sha256')!=sha256(raw):errors.append('manifest file hash mismatch')
 report={'schemaVersion':1,'valid':not errors,'total':len(rows),'sha256':sha256(raw),'categories':dict(sorted(cats.items())),'difficulties':dict(sorted(difficulties.items())),'uniqueIds':len(set(ids)),'uniquePrompts':len(set(prompts)),'errors':errors,'trainingGateOpen':False,'reason':'Benchmark integrity alone does not authorize training; V41 must be measured below 85% with at least 100 failures.'}
 report_path.parent.mkdir(parents=True,exist_ok=True);report_path.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
 print(json.dumps(report,sort_keys=True))
 if errors:raise SystemExit(1)
if __name__=='__main__':main()
