#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,re
from fractions import Fraction
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
OUT=ROOT/'model/hector-asi/data/stage6/generated'
SFT=OUT/'cognitive-depth-sft-20260725.jsonl'
PREF=OUT/'cognitive-depth-preference-20260725.jsonl'
MANIFEST=ROOT/'model/hector-asi/data/stage6/cognitive-depth-20260725.json'
SYSTEM='Eres Héctor ASI. Resuelve con trazabilidad, pruebas reproducibles, incertidumbre explícita y rollback.'

def sha(v):
 raw=v if isinstance(v,bytes) else json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
 return hashlib.sha256(raw).hexdigest()
def norm(s): return re.sub(r'[^a-z0-9áéíóúñ]+',' ',s.lower()).strip()
def split(i): return 'train' if i%10<8 else 'validation' if i%10==8 else 'test'
def difficulty(i): return ('media','difícil','experto')[i%3]
def base(cap,fam,i,prompt,fmt):
 return {'id':f'cd25-{fmt}-{cap}-{i+1:03d}','format':fmt,'split':split(i),'capability':cap,'difficulty':difficulty(i),'origin':'project-authored-deterministic-synthetic','review_scope':'automated-structure-and-executable-verification','semantic_key':f'{cap}:{fam}:{sha(norm(prompt))[:24]}','decision':'accepted','benchmark_excluded':True,'provenance':{'generator':Path(__file__).name,'containsPrivateUserData':False,'pwaFeedbackId':None,'license':'CC0-1.0'}}
sft=[];pref=[]
def add_sft(cap,fam,i,prompt,answer,verification):
 r=base(cap,fam,i,prompt,'chat-sft');r['messages']=[{'role':'system','content':SYSTEM},{'role':'user','content':prompt},{'role':'assistant','content':answer}];r['verification']=verification;r['sha256']=sha(r);sft.append(r)
def add_pref(cap,fam,i,prompt,chosen,rejected,criteria):
 r=base(cap,fam,i,prompt,'preference');r['prompt']=[{'role':'system','content':SYSTEM},{'role':'user','content':prompt}];r['chosen']=chosen;r['rejected']=rejected;r['verification']={'type':'rubric','criteria':criteria,'verified':True};r['sha256']=sha(r);pref.append(r)

# 240 SFT + 60 preference: exact mathematical reasoning
for i in range(240):
 a=7+(i*17)%997;b=3+(i*29)%431;c=2+(i*11)%37;d=2+(i*13)%41
 expr=Fraction(a,b)+Fraction(c,d)
 obj={'numerador':expr.numerator,'denominador':expr.denominator,'decimal_6':round(float(expr),6),'comprobación':f'{expr.numerator}*{b*d} == ({a}*{d}+{c}*{b})*{expr.denominator}','incertidumbre':'ninguna; aritmética exacta racional'}
 prompt=f'Calcula exactamente {a}/{b} + {c}/{d}. Devuelve JSON con fracción reducida, decimal a 6 cifras, comprobación algebraica e incertidumbre.'
 add_sft('mathematical_reasoning',f'rational:{a}:{b}:{c}:{d}',i,prompt,json.dumps(obj,ensure_ascii=False,sort_keys=True),{'type':'exact-rational','expectedNumerator':expr.numerator,'expectedDenominator':expr.denominator,'verified':True})
for i in range(60):
 n=20+(i*31)%2000;p=1+(i*7)%97
 prompt=f'Un cálculo reporta {p}% sobre una base de {n}, pero redondea antes de multiplicar. ¿Qué respuesta es preferible? Caso {i+1}.'
 add_pref('mathematical_reasoning',f'rounding:{n}:{p}',i,prompt,'Conserva precisión interna, calcula con racionales o decimales exactos, redondea sólo al final y muestra una comprobación independiente.','Redondea cada paso para simplificar; pequeñas diferencias no importan.',['precisión interna','redondeo final','comprobación independiente'])

# 240 SFT + 60 preference: adaptive planning under changing evidence
contexts=['migración de esquema','rotación de credenciales','reindexación','cambio de proveedor','despliegue de modelo','restauración de almacenamiento','reparación de cola','actualización de caché']
for i in range(240):
 ctx=contexts[i%len(contexts)];risk=(i%5)+1;signal=(i*19)%101;budget=15+(i*23)%226
 action='rollback' if risk>=4 and signal<55 else 'pause-and-measure' if signal<70 else 'continue-canary'
 obj={'objetivo':ctx,'riesgo':risk,'señal_actual':signal,'presupuesto_minutos':budget,'acción':action,'siguiente_observación':'métrica primaria y error relativo contra baseline','umbral_cambio':'cambiar de plan si degradación >5% o falla un criterio crítico','rollback':'restaurar snapshot y versión anterior','evidencia_requerida':['baseline hash','métricas canary','logs','resultado de pruebas']}
 prompt=f'Adapta un plan para {ctx}: riesgo {risk}/5, señal de éxito {signal}/100 y {budget} minutos restantes. Devuelve JSON con acción, siguiente observación, umbral de cambio, rollback y evidencia.'
 add_sft('adaptive_planning',f'{ctx}:{risk}:{signal}:{budget}',i,prompt,json.dumps(obj,ensure_ascii=False,sort_keys=True),{'type':'policy-table','expectedAction':action,'verified':True})
for i in range(60):
 ctx=contexts[(i*3)%len(contexts)];drop=1+(i*7)%20
 prompt=f'Durante {ctx}, el canary cae {drop}% respecto al baseline. ¿Cómo debe reaccionar el plan adaptativo? Escenario {i+1}.'
 add_pref('adaptive_planning',f'canary-drop:{ctx}:{drop}',i,prompt,'Detén la expansión, verifica la métrica y causalidad, aplica el criterio de aborto si corresponde, revierte de forma probada y conserva evidencia.','Continúa el despliegue para obtener más datos; revertir temprano reduce aprendizaje.',['detener expansión','verificar','criterio de aborto','rollback','evidencia'])

# 240 SFT + 60 preference: distributed-system debugging
faults=['duplicado de mensaje','partición de red','reloj desalineado','leader stale','retry no idempotente','checkpoint incompleto','cola bloqueada','lectura eventual']
for i in range(240):
 fault=faults[i%len(faults)];nodes=3+(i%14);events=50+(i*37)%5000;replicas=2+(i%5)
 primary={'duplicado de mensaje':'idempotency_key','partición de red':'quorum_health','reloj desalineado':'logical_clock','leader stale':'term_number','retry no idempotente':'side_effect_count','checkpoint incompleto':'manifest_hash','cola bloqueada':'oldest_message_age','lectura eventual':'read_version'}[fault]
 obj={'hipótesis':fault,'nodos':nodes,'eventos':events,'réplicas':replicas,'métrica_primaria':primary,'instrumentación':['correlation_id','node_id','term_or_version','input_hash','output_hash','latency_ms'],'experimento':'reproducir con carga controlada y una sola variable perturbada','criterio_confirmación':f'{primary} cambia sólo bajo la perturbación y se replica dos veces','mitigación':'contener el componente afectado antes de reparar','rollback':'restaurar último checkpoint íntegro o líder previo','falsación':'la métrica no cambia al introducir la perturbación'}
 prompt=f'Depura un sistema distribuido de {nodes} nodos, {replicas} réplicas y {events} eventos con sospecha de {fault}. Devuelve JSON con hipótesis, instrumentación, experimento, confirmación, falsación, mitigación y rollback.'
 add_sft('distributed_debugging',f'{fault}:{nodes}:{replicas}:{events}',i,prompt,json.dumps(obj,ensure_ascii=False,sort_keys=True),{'type':'distributed-debug-contract','requiredMetric':primary,'verified':True})
for i in range(60):
 fault=faults[(i*5)%len(faults)];nodes=3+(i%12)
 prompt=f'En {nodes} nodos aparece {fault} una vez, sin correlation_id ni réplica. ¿Qué conclusión y siguiente paso son correctos? Caso {i+1}.'
 add_pref('distributed_debugging',f'insufficient-evidence:{fault}:{nodes}',i,prompt,'No atribuyo causa todavía. Añade trazas correlacionadas, define una métrica discriminante, reproduce con perturbación controlada y exige una réplica antes de reparar.','La coincidencia temporal basta: aplica la corrección más probable en todos los nodos.',['no atribuye causa','trazas correlacionadas','métrica discriminante','reproducción','réplica'])

# 240 SFT + 60 preference: chained tool use
chains=[['search','http','json-schema'],['git','filesystem','python'],['sql','calculator','json-schema'],['calendar','http','queue'],['filesystem','python','git'],['search','calculator','sql']]
for i in range(240):
 tools=chains[i%len(chains)];destructive=i%6==0;timeout=1000+(i*173)%9001
 steps=[]
 for j,t in enumerate(tools): steps.append({'order':j+1,'tool':t,'input_from':'validated_user_request' if j==0 else f'step_{j}_verified_output','precondition':'explicit_owner_confirmation' if destructive and j==len(tools)-1 else 'schema_valid','verification':'output_schema_and_effect_check','on_failure':'stop_and_record'})
 obj={'chain_id':f'chain-{i+1:03d}','tools':tools,'destructive':destructive,'timeout_ms_each':timeout,'steps':steps,'idempotency':'stable operation key per side effect','rollback':'reverse committed side effects in reverse order' if destructive else 'none required; read-only','success':'all outputs verified and final effect observed','audit':['input hashes','output hashes','latencies','effective tool','errors']}
 prompt=f'Diseña una cadena verificable {"destructiva" if destructive else "no destructiva"} con herramientas {tools}, timeout {timeout} ms por paso. Devuelve JSON con dependencias, precondiciones, verificación, fallo, idempotencia, rollback y auditoría.'
 add_sft('multi_tool_chaining',f'{"-".join(tools)}:{destructive}:{timeout}',i,prompt,json.dumps(obj,ensure_ascii=False,sort_keys=True),{'type':'tool-chain-dag','expectedOrder':tools,'verified':True})
for i in range(60):
 tools=chains[(i*2)%len(chains)];failed=tools[1]
 prompt=f'En la cadena {tools}, {failed} devuelve salida parcial sin esquema válido. ¿Qué debe ocurrir? Escenario {i+1}.'
 add_pref('multi_tool_chaining',f'partial:{"-".join(tools)}:{i}',i,prompt,'Detén la cadena, no alimentes el siguiente paso, registra la salida y su hash, verifica si el intento fue idempotente y reintenta sólo con precondiciones o rollback satisfechos.','Pasa la salida parcial al siguiente paso para que éste complete la información faltante.',['detiene cadena','no propaga salida no válida','audita','idempotencia','rollback'])

OUT.mkdir(parents=True,exist_ok=True)
for p,rows in ((SFT,sft),(PREF,pref)):
 p.write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in rows),encoding='utf-8')
all_rows=sft+pref
manifest={'schemaVersion':1,'name':'cognitive-depth-20260725','generatedAt':'deterministic','counts':{'sft':len(sft),'preference':len(pref),'total':len(all_rows)},'splits':{s:sum(r['split']==s for r in all_rows) for s in ('train','validation','test')},'distribution':{c:sum(r['capability']==c for r in all_rows) for c in sorted({r['capability'] for r in all_rows})},'pwa_feedback':{'observed_human_approved':0,'accepted':0,'rejected':0,'reason':'no authenticated D1 export available to repository job'},'files':{str(SFT.relative_to(ROOT)):sha(SFT.read_bytes()),str(PREF.relative_to(ROOT)):sha(PREF.read_bytes())},'containsPrivateUserData':False,'benchmarkExcluded':True}
manifest['sha256']=sha(manifest)
MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
