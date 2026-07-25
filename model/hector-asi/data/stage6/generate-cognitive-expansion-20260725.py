#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
OUT=ROOT/'model/hector-asi/data/stage6/generated'
SFT=OUT/'cognitive-expansion-sft-20260725.jsonl'
PREF=OUT/'cognitive-expansion-preference-20260725.jsonl'
MANIFEST=ROOT/'model/hector-asi/data/stage6/cognitive-expansion-20260725.json'
SYSTEM='Eres Héctor ASI. Resuelve con trazabilidad, incertidumbre explícita, herramientas verificables, causalidad y pruebas reproducibles.'

def digest(value):
 raw=value if isinstance(value,bytes) else json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
 return hashlib.sha256(raw).hexdigest()
def norm(text): return re.sub(r'[^a-z0-9áéíóúñ]+',' ',text.lower()).strip()
def difficulty(i): return ('media','difícil','experto')[i%3]

sft=[];pref=[]
def add_sft(cap,fam,i,prompt,answer,verification):
 row={'id':f'ce25-{cap}-{i+1:03d}','format':'chat-sft','capability':cap,'difficulty':difficulty(i),'messages':[{'role':'system','content':SYSTEM},{'role':'user','content':prompt},{'role':'assistant','content':answer}],'verification':verification,'provenance':{'kind':'project-authored-deterministic-synthetic','generator':Path(__file__).name,'containsPrivateUserData':False,'pwaFeedbackId':None,'license':'CC0-1.0'},'benchmark_excluded':True,'semantic_key':f'{cap}:{fam}:{digest(norm(prompt))[:20]}'}
 row['sha256']=digest(row);sft.append(row)
def add_pref(cap,fam,i,prompt,chosen,rejected,criteria):
 row={'id':f'ce25-pref-{cap}-{i+1:03d}','format':'preference','capability':cap,'difficulty':difficulty(i),'prompt':[{'role':'system','content':SYSTEM},{'role':'user','content':prompt}],'chosen':chosen,'rejected':rejected,'verification':{'type':'rubric','criteria':criteria,'verified':True},'provenance':{'kind':'project-authored-deterministic-synthetic','generator':Path(__file__).name,'containsPrivateUserData':False,'pwaFeedbackId':None,'license':'CC0-1.0'},'benchmark_excluded':True,'semantic_key':f'{cap}:{fam}:{digest(norm(prompt))[:20]}'}
 row['sha256']=digest(row);pref.append(row)

# 200 SFT + 50 preference: metacognition
for i in range(200):
 evidence=2+(i*7)%19; conflicts=i%6; unknowns=(i*5)%9; cost=1+(i*13)%100
 confidence='alta' if evidence>=14 and conflicts==0 and unknowns<=1 else 'media' if evidence>=7 and conflicts<=2 else 'baja'
 action='ejecutar_con_canary' if confidence=='alta' and cost<70 else 'recabar_evidencia' if confidence!='baja' else 'detener_y_escalar'
 obj={'confianza':confidence,'evidencias_independientes':evidence,'conflictos':conflicts,'incógnitas':unknowns,'costo_error':cost,'acción':action,'qué_cambiaría_la_decisión':'una réplica independiente que resuelva contradicciones y reduzca incógnitas','límite':'no inferir certeza desde volumen sin independencia'}
 prompt=f'Autoevalúa una decisión con {evidence} evidencias, {conflicts} conflictos, {unknowns} incógnitas y costo de error {cost}/100. Devuelve JSON con confianza, acción, condición de revisión y límite.'
 add_sft('metacognition',f'self-check:{evidence}:{conflicts}:{unknowns}:{cost}',i,prompt,json.dumps(obj,ensure_ascii=False,sort_keys=True),{'type':'json-structure','required':list(obj),'expected':obj,'verified':True})
for i in range(50):
 prompt=f'Has producido una respuesta con {i%5} fuentes independientes y {i%4} contradicciones. ¿Debes presentarla como definitiva?'
 add_pref('metacognition','anti-certainty',i,prompt,'No. Separa hechos, inferencias e incógnitas; calibra confianza y especifica qué evidencia cambiaría la conclusión.','Sí. Si la explicación suena coherente puede presentarse como definitiva.',['calibra confianza','declara incógnitas','condición de revisión'])

# 200 SFT + 50 preference: tool use
TOOLS=['sql','http','python','filesystem','calculator','calendar','search','git','queue','json-schema']
for i in range(200):
 tool=TOOLS[i%len(TOOLS)]; retries=1+i%4; timeout=500+(i*137)%4501; destructive=i%7==0
 plan={'tool':tool,'entrada_validada':True,'timeout_ms':timeout,'reintentos':retries,'idempotencia':'clave estable por operación','precondición':'autorización explícita' if destructive else 'esquema válido','ejecución':'simulación primero' if destructive else 'llamada controlada','verificación':['código de salida','resultado contra esquema','efecto observado'],'rollback':'restaurar snapshot o revertir commit' if destructive else 'sin efecto persistente','registro':['tool','entrada hash','salida hash','latencia','error']}
 prompt=f'Diseña una ejecución verificable con herramienta {tool}, timeout {timeout} ms, {retries} reintentos y operación {"destructiva" if destructive else "no destructiva"}. Devuelve JSON.'
 add_sft('tool_use',f'{tool}:{destructive}:{timeout}:{retries}',i,prompt,json.dumps(plan,ensure_ascii=False,sort_keys=True),{'type':'json-structure','required':list(plan),'expected':plan,'verified':True})
for i in range(50):
 tool=TOOLS[(i*3)%len(TOOLS)]
 prompt=f'Para una operación con {tool}, el primer intento devuelve un resultado parcial y no verificable. ¿Qué haces?'
 add_pref('tool_use','verify-before-claim',i,prompt,'No afirmo éxito. Valido esquema y efecto observado, registro evidencia y reintento sólo si la operación es idempotente o existe rollback.','Asumo éxito porque hubo una respuesta parcial y continúo.',['no afirma éxito','verifica efecto','considera idempotencia o rollback'])

# 200 SFT + 50 preference: causal reasoning
CAUSES=['latencia','temperatura','carga','sesgo de selección','pérdida de paquetes','cambio de versión','fatiga','presión','humedad','orden de eventos']
OUTCOMES=['errores','fallos','rendimiento','precisión','abandono','consumo','inestabilidad','recuperación','variabilidad','degradación']
for i in range(200):
 cause=CAUSES[i%10]; outcome=OUTCOMES[(i*7)%10]; confounders=[CAUSES[(i+2)%10],CAUSES[(i+5)%10]]; sample=50+(i*29)%1951
 obj={'hipótesis':f'{cause} influye causalmente en {outcome}','confusores':confounders,'intervención':f'variar {cause} manteniendo constantes {confounders[0]} y {confounders[1]}','control':'grupo contemporáneo sin intervención','métrica_primaria':outcome,'tamaño_muestra':sample,'criterio':'efecto consistente, intervalo excluye cero y réplica independiente','falsación':f'sin cambio en {outcome} tras intervenir {cause}','límite':'asociación observacional sola no prueba causalidad'}
 prompt=f'Evalúa si {cause} causa {outcome} con muestra {sample}. Diseña intervención, control, confusores, criterio y falsación en JSON.'
 add_sft('causal_reasoning',f'{cause}:{outcome}:{sample}',i,prompt,json.dumps(obj,ensure_ascii=False,sort_keys=True),{'type':'json-structure','required':list(obj),'expected':obj,'verified':True})
for i in range(50):
 cause=CAUSES[i%10];outcome=OUTCOMES[(i+3)%10]
 prompt=f'Una correlación fuerte entre {cause} y {outcome} aparece después de filtrar sólo casos exitosos. ¿Conclusión?'
 add_pref('causal_reasoning','selection-bias',i,prompt,'No concluyo causalidad. El filtro puede inducir sesgo de selección; necesito un control, una intervención o un diseño cuasiexperimental y análisis de sensibilidad.','La correlación fuerte confirma que la causa produce el resultado.',['rechaza causalidad directa','identifica sesgo de selección','propone control o intervención'])

# 200 SFT + 50 preference: multi-file code
for i in range(200):
 module=f'pkg{i+1:03d}'; limit=2+(i%8); value=(i*17)%101
 files={
  f'{module}/core.py':f"def clamp(value, low=0, high={limit*10}):\n    if low > high: raise ValueError('bounds')\n    return max(low, min(high, value))\n",
  f'{module}/service.py':f"from .core import clamp\n\ndef normalize(value):\n    return clamp(int(value), 0, {limit*10})\n",
  f'tests/test_{module}.py':f"from {module}.service import normalize\n\ndef test_bounds():\n    assert normalize(-1)==0\n    assert normalize({limit*20})=={limit*10}\n    assert normalize({value})=={min(value,limit*10)}\n"
 }
 answer=json.dumps({'files':files,'commands':['python -m pytest -q'],'expected':'3 assertions pass','rollback':'revertir los tres archivos juntos'},ensure_ascii=False,sort_keys=True)
 prompt=f'Implementa un cambio multiarchivo en paquete {module}: función clamp, servicio normalize y prueba de límites. Máximo {limit*10}. Devuelve JSON con files, commands, expected y rollback.'
 add_sft('multi_file_code',f'{module}:{limit}:{value}',i,prompt,answer,{'type':'python-multifile','files':files,'assertions':3,'verified':True})
for i in range(50):
 module=f'pkgpref{i+1:03d}'
 prompt=f'Debes cambiar core, servicio y pruebas de {module}. ¿Qué estrategia minimiza regresiones?'
 add_pref('multi_file_code','atomic-change',i,prompt,'Define contrato, cambia los archivos como unidad atómica, ejecuta pruebas focales y de regresión, revisa imports y conserva rollback del conjunto.','Modifica sólo core.py y deja que los demás archivos se adapten después.',['contrato','cambio atómico','pruebas','rollback'])

OUT.mkdir(parents=True,exist_ok=True)
for path,rows in ((SFT,sft),(PREF,pref)):
 path.write_text(''.join(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n' for row in rows),encoding='utf-8')
manifest={'name':'cognitive-expansion-20260725','generated_at':'deterministic','counts':{'sft':len(sft),'preference':len(pref),'total':len(sft)+len(pref)},'distribution':{cap:sum(r['capability']==cap for r in sft+pref) for cap in sorted({r['capability'] for r in sft+pref})},'pwa_feedback':{'observed_human_approved':0,'accepted':0,'rejected':0,'reason':'no authenticated production export available in repository execution'},'files':{str(SFT.relative_to(ROOT)):digest(SFT.read_bytes()),str(PREF.relative_to(ROOT)):digest(PREF.read_bytes())},'benchmark_excluded':True,'contains_private_user_data':False}
manifest['sha256']=digest(manifest)
MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
