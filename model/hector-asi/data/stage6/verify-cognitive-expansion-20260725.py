#!/usr/bin/env python3
from __future__ import annotations
import ast,hashlib,json,re,subprocess,sys,tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
BASE=ROOT/'model/hector-asi/data/stage6'
SFT=BASE/'generated/cognitive-expansion-sft-20260725.jsonl'
PREF=BASE/'generated/cognitive-expansion-preference-20260725.jsonl'
MANIFEST=BASE/'cognitive-expansion-20260725.json'
BENCH=ROOT/'model/hector-asi/evals/benchmark_v2/v41-benchmark-v2-latest.json'

def sha(value):
 raw=value if isinstance(value,bytes) else json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
 return hashlib.sha256(raw).hexdigest()
def norm(s): return re.sub(r'[^a-z0-9áéíóúñ]+',' ',s.lower()).strip()
def load_jsonl(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]

def fail(msg): raise AssertionError(msg)

sft=load_jsonl(SFT);pref=load_jsonl(PREF);all_rows=sft+pref;manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
if len(sft)!=800 or len(pref)!=200 or len(all_rows)!=1000: fail(f'conteos inválidos: {len(sft)}/{len(pref)}')
expected={'metacognition':250,'tool_use':250,'causal_reasoning':250,'multi_file_code':250}
dist={k:sum(r['capability']==k for r in all_rows) for k in expected}
if dist!=expected: fail(f'distribución inválida: {dist}')
ids=[r['id'] for r in all_rows];keys=[r['semantic_key'] for r in all_rows]
if len(set(ids))!=1000: fail('IDs duplicados')
if len(set(keys))!=1000: fail('semantic_key duplicada')
for row in all_rows:
 saved=row['sha256'];copy=dict(row);copy.pop('sha256')
 if saved!=sha(copy): fail(f'hash inválido {row["id"]}')
 if row.get('benchmark_excluded') is not True: fail('benchmark_excluded ausente')
 p=row['provenance']
 if p.get('containsPrivateUserData') is not False or p.get('pwaFeedbackId') is not None: fail('procedencia privada/PWA inválida')
 if row['format']=='chat-sft':
  if row['messages'][-1]['role']!='assistant': fail('SFT mal formado')
 else:
  if row['chosen']==row['rejected']: fail('preferencia sin contraste')

# Rechazar coincidencias textuales exactas con cualquier texto visible del benchmark.
bench_text=BENCH.read_text(encoding='utf-8') if BENCH.exists() else ''
bench_norm=norm(bench_text)
for row in all_rows:
 prompt=row['messages'][1]['content'] if row['format']=='chat-sft' else row['prompt'][1]['content']
 if len(norm(prompt))>40 and norm(prompt) in bench_norm: fail(f'posible contaminación exacta {row["id"]}')

# Validar JSON estructurado y ejecutar una muestra completa de los 200 ejercicios multiarchivo.
for row in sft:
 answer=row['messages'][-1]['content']
 if row['capability']!='multi_file_code':
  obj=json.loads(answer)
  required=row['verification']['required']
  if any(k not in obj for k in required): fail(f'JSON incompleto {row["id"]}')
 else:
  payload=json.loads(answer);files=payload['files']
  if len(files)!=3: fail(f'multifile incompleto {row["id"]}')
  for name,content in files.items():
   ast.parse(content)
  with tempfile.TemporaryDirectory() as td:
   root=Path(td)
   for name,content in files.items():
    target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(content,encoding='utf-8')
   package=next(iter(files)).split('/')[0]
   (root/package/'__init__.py').write_text('',encoding='utf-8')
   result=subprocess.run([sys.executable,'-m','pytest','-q'],cwd=root,capture_output=True,text=True,timeout=20)
   if result.returncode!=0: fail(f'pytest falló {row["id"]}: {result.stdout} {result.stderr}')

paths={str(SFT.relative_to(ROOT)):sha(SFT.read_bytes()),str(PREF.relative_to(ROOT)):sha(PREF.read_bytes())}
if manifest['files']!=paths: fail('hashes de archivos no coinciden')
copy=dict(manifest);saved=copy.pop('sha256')
if saved!=sha(copy): fail('hash de manifiesto inválido')
if manifest['counts']!={'sft':800,'preference':200,'total':1000}: fail('manifest counts inválidos')
if manifest['distribution']!=expected: fail('manifest distribution inválida')
print(json.dumps({'ok':True,'counts':manifest['counts'],'distribution':dist,'unique_ids':len(set(ids)),'unique_semantic_keys':len(set(keys)),'executed_multifile_suites':200,'manifest_sha256':saved},ensure_ascii=False,sort_keys=True))
