#!/usr/bin/env python3
import argparse,hashlib,json,re,sys
from collections import Counter
from pathlib import Path

CAPS={'mathematics','code','planning','tools','causality','verification','calibration','metacognition'}

def norm(text): return re.sub(r'[^a-z0-9]+',' ',text.lower()).strip()
def words(text): return set(norm(text).split())
def similarity(a,b):
    aa,bb=words(a),words(b)
    return len(aa&bb)/max(1,len(aa|bb))

def load_jsonl(path):
    rows=[]
    for number,line in enumerate(Path(path).read_text().splitlines(),1):
        try: rows.append(json.loads(line))
        except Exception as exc: raise SystemExit(f'JSON inválido en línea {number}: {exc}')
    return rows

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--corpus',required=True); parser.add_argument('--manifest',required=True); parser.add_argument('--benchmark'); parser.add_argument('--output',required=True); args=parser.parse_args()
    rows=load_jsonl(args.corpus); failures=[]; ids=set(); prompts={}; caps=Counter(); difficulty=Counter(); splits=Counter(); verifier_types=Counter()
    for item in rows:
        item_id=item.get('id'); cap=item.get('capability'); diff=item.get('difficulty'); split=item.get('split'); messages=item.get('messages') or []; verifier=item.get('verifier') or {}
        if not item_id or item_id in ids: failures.append(f'id duplicado/inválido: {item_id}')
        ids.add(item_id)
        if cap not in CAPS: failures.append(f'capacidad inválida {item_id}: {cap}')
        if diff not in {1,2,3,4}: failures.append(f'dificultad inválida {item_id}: {diff}')
        if split not in {'train','validation'}: failures.append(f'split inválido {item_id}: {split}')
        if len(messages)!=2 or [m.get('role') for m in messages]!=['user','assistant']: failures.append(f'mensajes inválidos: {item_id}'); continue
        prompt=norm(messages[0].get('content','')); answer=messages[1].get('content','')
        if len(prompt)<20 or len(answer)<10: failures.append(f'contenido demasiado corto: {item_id}')
        if prompt in prompts: failures.append(f'prompt exacto duplicado: {item_id}/{prompts[prompt]}')
        prompts[prompt]=item_id
        if item.get('license')!='Apache-2.0': failures.append(f'licencia inválida: {item_id}')
        if item.get('provenance',{}).get('kind')!='deterministic-author-generated': failures.append(f'procedencia inválida: {item_id}')
        if not verifier.get('type'): failures.append(f'sin verificador: {item_id}')
        caps[cap]+=1; difficulty[diff]+=1; splits[split]+=1; verifier_types[verifier.get('type')]+=1
    if len(rows)!=2048: failures.append(f'conteo esperado 2048, recibido {len(rows)}')
    for cap in CAPS:
        if caps[cap]!=256: failures.append(f'desbalance {cap}: {caps[cap]}')
    for level in range(1,5):
        if difficulty[level]!=512: failures.append(f'desbalance dificultad {level}: {difficulty[level]}')
    if splits!={'train':1792,'validation':256}: failures.append(f'splits inesperados: {dict(splits)}')
    benchmark_overlap=[]
    if args.benchmark and Path(args.benchmark).exists():
        bench=load_jsonl(args.benchmark)
        bench_prompts=[(x.get('id'),(x.get('messages') or [{'content':''}])[0].get('content','')) for x in bench]
        for item in rows:
            prompt=item['messages'][0]['content']
            for bench_id,bench_prompt in bench_prompts:
                score=similarity(prompt,bench_prompt)
                if score>=0.82: benchmark_overlap.append({'corpusId':item['id'],'benchmarkId':bench_id,'jaccard':round(score,4)})
    if benchmark_overlap: failures.append(f'contaminación semántica: {len(benchmark_overlap)} pares')
    payload=Path(args.corpus).read_bytes(); manifest=json.loads(Path(args.manifest).read_text()); digest=hashlib.sha256(payload).hexdigest()
    if manifest.get('sha256')!=digest or manifest.get('examples')!=len(rows): failures.append('manifiesto no coincide con corpus')
    report={'schemaVersion':1,'accepted':not failures,'examples':len(rows),'sha256':digest,'bytes':len(payload),'capabilities':dict(caps),'difficulty':{str(k):v for k,v in sorted(difficulty.items())},'splits':dict(splits),'verifierTypes':dict(verifier_types),'exactDuplicates':0,'benchmarkChecked':bool(args.benchmark and Path(args.benchmark).exists()),'benchmarkOverlap':benchmark_overlap[:50],'rejected':len(failures),'failures':failures}
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False))
    if failures: sys.exit(1)
if __name__=='__main__': main()
