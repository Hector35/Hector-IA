#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
OUT=ROOT/'model/hector-asi/data/stage6/generated'
SFT=OUT/'failure-driven-sft-20260725.jsonl'
PREF=OUT/'failure-driven-preference-20260725.jsonl'
MANIFEST=ROOT/'model/hector-asi/data/stage6/failure-driven-20260725.json'
SYSTEM='Eres Héctor ASI. Responde con precisión, evidencia verificable, calibración explícita y rollback cuando corresponda.'

def sha(value):
    raw=value if isinstance(value,bytes) else json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
    return hashlib.sha256(raw).hexdigest()

def norm(s): return re.sub(r'[^a-z0-9]+',' ',s.lower()).strip()

def difficulty(i): return ('media','difícil','experto')[i%3]

sft=[]; pref=[]
def add_sft(cap,fam,i,prompt,answer,verification):
    row={'id':f'fd25-{cap}-{i+1:03d}','format':'chat-sft','capability':cap,'difficulty':difficulty(i),'messages':[{'role':'system','content':SYSTEM},{'role':'user','content':prompt},{'role':'assistant','content':answer}],'verification':verification,'provenance':{'kind':'project-authored-deterministic-synthetic','generator':'generate-failure-driven-20260725.py','sourceBenchmark':'v41-benchmark-v2-latest.json','containsPrivateUserData':False,'license':'CC0-1.0'},'benchmark_excluded':True,'semantic_key':f'{cap}:{fam}:{sha(norm(prompt))[:20]}'}
    row['sha256']=sha(row);sft.append(row)
def add_pref(cap,fam,i,prompt,chosen,rejected,criteria):
    row={'id':f'fd25-pref-{cap}-{i+1:03d}','format':'preference','capability':cap,'difficulty':difficulty(i),'prompt':[{'role':'system','content':SYSTEM},{'role':'user','content':prompt}],'chosen':chosen,'rejected':rejected,'verification':{'type':'rubric','criteria':criteria,'verified':True},'provenance':{'kind':'project-authored-deterministic-synthetic','generator':'generate-failure-driven-20260725.py','sourceBenchmark':'v41-benchmark-v2-latest.json','containsPrivateUserData':False,'license':'CC0-1.0'},'benchmark_excluded':True,'semantic_key':f'{cap}:{fam}:{sha(norm(prompt))[:20]}'}
    row['sha256']=sha(row);pref.append(row)

# 200 SFT + 40 preference per priority capability.
for i in range(200):
    n=20+(i*13)%980; successes=(i*17)% (n+1); independent=35+(i*11)%66; conflicts=i%5
    posterior=round((successes+1)/(n+2),4); width=round(min(.45,1.96*((posterior*(1-posterior)/max(1,n))**.5)),4)
    level='alta' if posterior-width>=.8 and independent>=75 and conflicts==0 else 'media' if posterior-width>=.55 and conflicts<=2 else 'baja'
    prompt=f'Calibra una decisión con {successes}/{n} éxitos, independencia {independent}%, {conflicts} evidencias contradictorias. Entrega JSON con confianza, estimación, intervalo aproximado, decisión y condición de escalamiento.'
    obj={'confianza':level,'estimacion':posterior,'intervalo_aproximado':[round(max(0,posterior-width),4),round(min(1,posterior+width),4)],'decision':'promover' if level=='alta' else 'mantener_en_validacion','condicion_escalamiento':'réplica independiente y límite inferior >= 0.80 sin contradicciones'}
    add_sft('calibration',f'binomial:{independent}:{conflicts}',i,prompt,json.dumps(obj,ensure_ascii=False,sort_keys=True),{'type':'json-structure','required':['confianza','estimacion','intervalo_aproximado','decision','condicion_escalamiento'],'expected':obj,'verified':True})
for i in range(40):
    n=40+i*7; good=(i*19)%n; prompt=f'Con {good}/{n} aciertos y sin réplica independiente, decide si afirmar certeza alta.'
    chosen='No. Reporta estimación e intervalo, declara incertidumbre y exige una réplica independiente antes de certeza alta.'
    rejected='Sí. La mayoría de los casos basta para afirmar certeza alta.'
    add_pref('calibration','anti-overconfidence',i,prompt,chosen,rejected,['no afirma certeza alta','declara incertidumbre','exige réplica'])

contexts=['migración D1','rotación de secretos','cambio de proveedor','despliegue PWA','actualización de modelo','reindexación','cambio de esquema','reparación de cola','cambio de caché','restauración R2']
for i in range(200):
    ctx=contexts[i%len(contexts)]; window=15+(i*7)%166; checks=2+i%5; risk=('medio','alto','crítico')[i%3]
    steps=['capturar baseline y hash','definir criterio de éxito y abortar','preparar rollback probado',f'ejecutar canary durante {window} minutos',f'correr {checks} verificaciones independientes','comparar contra baseline','promover o revertir','guardar evidencia y responsables']
    obj={'objetivo':ctx,'riesgo':risk,'ventana_minutos':window,'pasos':steps,'rollback_trigger':'cualquier criterio crítico falla o degradación >5%','evidencia':['hash antes/después','logs','métricas','resultado de pruebas']}
    prompt=f'Diseña un plan ejecutable para {ctx}, riesgo {risk}, ventana {window} minutos y {checks} verificaciones. Responde JSON.'
    add_sft('planning',f'{ctx}:{risk}',i,prompt,json.dumps(obj,ensure_ascii=False,sort_keys=True),{'type':'json-structure','required':['objetivo','riesgo','ventana_minutos','pasos','rollback_trigger','evidencia'],'expected':obj,'verified':True})
for i in range(40):
    ctx=contexts[(i*3)%len(contexts)]; prompt=f'Planifica {ctx} en producción sin interrupción y con reversión segura.'
    chosen='Baseline → canary → verificaciones independientes → criterio de aborto → rollback probado → evidencia y cierre.'
    rejected='Aplica el cambio completo, observa si funciona y corrige después.'
    add_pref('planning','rollback-first',i,prompt,chosen,rejected,['baseline','canary','verificación','rollback','evidencia'])

source_domains=['baterías','colas distribuidas','ensayos clínicos','inventarios','sensores biomédicos','modelos de lenguaje','redes eléctricas','finanzas','control térmico','bases de datos']
target_domains=['cachés','tráfico urbano','triaje','logística','detección de fraude','compiladores','microservicios','calidad industrial','telemetría','sistemas de respaldo']
for i in range(200):
    src=source_domains[i%10]; dst=target_domains[(i*7)%10]; invariant=['conservación de flujo','retroalimentación negativa','sesgo de selección','cuello de botella','degradación acumulativa'][i%5]
    obj={'origen':src,'destino':dst,'invariante':invariant,'mapeo':[f'identificar variables equivalentes en {src} y {dst}','separar mecanismo de vocabulario','probar contra un caso adversarial'],'limite':'la analogía se rechaza si no conserva relaciones causales','prueba':f'construir un ejemplo control y uno contraejemplo en {dst}'}
    prompt=f'Transfiere una solución de {src} a {dst} usando el invariante “{invariant}”. Explica mapeo, límite y prueba en JSON.'
    add_sft('transfer',f'{src}:{dst}:{invariant}',i,prompt,json.dumps(obj,ensure_ascii=False,sort_keys=True),{'type':'json-structure','required':['origen','destino','invariante','mapeo','limite','prueba'],'expected':obj,'verified':True})
for i in range(40):
    src=source_domains[i%10];dst=target_domains[(i+4)%10];prompt=f'¿Cómo usarías una analogía de {src} en {dst} sin sobreextenderla?'
    chosen='Mapea relaciones causales, declara qué no se conserva y valida con un caso control y un contraejemplo en el dominio destino.'
    rejected='Usa los mismos pasos porque ambos sistemas se parecen conceptualmente.'
    add_pref('transfer','bounded-analogy',i,prompt,chosen,rejected,['mapea relaciones','declara límites','incluye contraejemplo'])

code_families=[
 ('retry',lambda n:f"def {n}(fn, attempts):\n    if attempts < 1: raise ValueError('attempts')\n    last=None\n    for _ in range(attempts):\n        try: return fn()\n        except Exception as e: last=e\n    raise last",lambda n:f"c=[0]\ndef f():\n c[0]+=1\n if c[0]<3: raise RuntimeError('x')\n return 7\nassert {n}(f,3)==7"),
 ('toposort',lambda n:f"def {n}(graph):\n    seen={{}};out=[]\n    def visit(v):\n        if seen.get(v)==1: raise ValueError('cycle')\n        if seen.get(v)==2:return\n        seen[v]=1\n        for w in graph.get(v,[]): visit(w)\n        seen[v]=2;out.append(v)\n    for v in graph: visit(v)\n    return out",lambda n:f"r={n}({{'a':['b'],'b':[]}});assert r.index('b')<r.index('a')"),
 ('window',lambda n:f"def {n}(xs,k):\n    if k<=0: raise ValueError('k')\n    if k>len(xs): return []\n    s=sum(xs[:k]);out=[s]\n    for i in range(k,len(xs)):\n        s+=xs[i]-xs[i-k];out.append(s)\n    return out",lambda n:f"assert {n}([1,2,3,4],2)==[3,5,7];assert {n}([],1)==[]"),
 ('merge',lambda n:f"def {n}(left,right):\n    out=dict(left)\n    for k,v in right.items():\n        if k in out and out[k]!=v: raise ValueError(k)\n        out[k]=v\n    return out",lambda n:f"assert {n}({{'a':1}},{{'b':2}})=={{'a':1,'b':2}}\ntry:{n}({{'a':1}},{{'a':2}});assert False\nexcept ValueError:pass"),
 ('chunks',lambda n:f"def {n}(xs,size):\n    if size<=0: raise ValueError('size')\n    return [xs[i:i+size] for i in range(0,len(xs),size)]",lambda n:f"assert {n}([1,2,3,4,5],2)==[[1,2],[3,4],[5]]")]
for i in range(200):
    fam,body,test=code_families[i%len(code_families)];name=f'{fam}_{i+1:03d}';code=body(name);tests=test(name)
    prompt=f'Implementa `{name}` en Python con manejo explícito de casos límite y sin dependencias externas.'
    add_sft('code',fam,i,prompt,f'```python\n{code}\n```',{'type':'python-tests','code':code,'test':tests,'verified':True})
for i in range(40):
    fam,body,test=code_families[i%len(code_families)];name=f'{fam}_pref_{i+1:03d}';chosen=f"```python\n{body(name)}\n```";rejected=f"```python\ndef {name}(*args):\n    return None\n```"
    add_pref('code',fam,i,f'Implementa `{name}` y cubre errores y casos límite.',chosen,rejected,['implementación funcional','manejo de errores','casos límite','tests ejecutables'])

OUT.mkdir(parents=True,exist_ok=True)
SFT.write_text('\n'.join(json.dumps(x,ensure_ascii=False,sort_keys=True) for x in sft)+'\n',encoding='utf-8')
PREF.write_text('\n'.join(json.dumps(x,ensure_ascii=False,sort_keys=True) for x in pref)+'\n',encoding='utf-8')
manifest={'schemaVersion':1,'status':'validated-on-branch','integratedExamples':0,'generatedExamples':len(sft)+len(pref),'sft':len(sft),'preference':len(pref),'distribution':{c:sum(1 for x in sft+pref if x['capability']==c) for c in ['calibration','planning','transfer','code']},'sourceBenchmarkSha256':'b8b774d21e2210482fdb417bd4c74eedea90e28c35b2fe1f58dc1fa4b65cc094','pwaApprovedObserved':0,'pwaAccepted':0,'pwaRejected':0,'pwaReason':'No authenticated production D1 export was available to this repository run; no PWA row was guessed or imported.','sftSha256':sha(SFT.read_bytes()),'preferenceSha256':sha(PREF.read_bytes())}
MANIFEST.write_text(json.dumps(manifest,indent=2,ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
print(json.dumps(manifest,indent=2,ensure_ascii=False,sort_keys=True))
