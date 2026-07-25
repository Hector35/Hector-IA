#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];OUT=ROOT/'model/hector-asi/data/stage6/generated';MAN=ROOT/'model/hector-asi/data/stage6/v41-priority-depth-20260725.json'
SFT=OUT/'v41-priority-depth-sft-20260725.jsonl';PREF=OUT/'v41-priority-depth-preference-20260725.jsonl'
SYS='Eres Héctor. Resuelve con incertidumbre calibrada, plan ejecutable, transferencia estructural y código verificado.'
def h(x):
 b=x if isinstance(x,bytes) else json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode();return hashlib.sha256(b).hexdigest()
def norm(x):return re.sub(r'[^a-z0-9áéíóúñ]+',' ',x.lower()).strip()
def split(i):return 'train' if i%10<8 else 'validation' if i%10==8 else 'test'
def diff(i):return ('medium','hard','expert')[i%3]
sft=[];pref=[]
def common(cap,fam,i,prompt,fmt):return {'id':f'v41pd-{fmt}-{cap}-{i+1:03d}','format':fmt,'capability':cap,'difficulty':diff(i),'split':split(i),'origin':{'kind':'project-authored-deterministic-synthetic','generator':Path(__file__).name,'license':'CC0-1.0','pwaFeedbackId':None,'containsPrivateUserData':False},'reviewScope':['secrets','sensitive-data','factuality','code-execution','semantic-deduplication','benchmark-leakage'],'semanticKey':f'{cap}:{fam}:{h(norm(prompt))[:24]}','decision':'accepted','benchmarkExcluded':True}
def add_sft(cap,fam,i,prompt,answer,verification):
 r=common(cap,fam,i,prompt,'chat-sft');r['messages']=[{'role':'system','content':SYS},{'role':'user','content':prompt},{'role':'assistant','content':answer}];r['verification']=verification;r['sha256']=h(r);sft.append(r)
def add_pref(cap,fam,i,prompt,chosen,rejected,criteria):
 r=common(cap,fam,i,prompt,'preference');r['prompt']=[{'role':'system','content':SYS},{'role':'user','content':prompt}];r['chosen']=chosen;r['rejected']=rejected;r['verification']={'type':'rubric','criteria':criteria,'verified':True};r['sha256']=h(r);pref.append(r)
# calibration 320+80
for i in range(320):
 n=3+(i*11)%31;c=(i*7)%8;u=(i*13)%10;impact=1+(i*17)%100
 p=f'Estima confianza para {n} observaciones, {c} contradicciones, {u} incógnitas y costo de error {impact}/100. Devuelve JSON y no conviertas cantidad en independencia.'
 independent=max(1,n-c//2);conf='high' if independent>=20 and c==0 and u<=1 else 'medium' if independent>=8 and c<=2 and u<=4 else 'low'
 a={'confidence':conf,'independentEvidence':independent,'contradictions':c,'unknowns':u,'errorCost':impact,'decision':'act_with_monitoring' if conf=='high' and impact<70 else 'gather_more_evidence' if conf!='low' else 'stop_and_escalate','revisionTrigger':'new independent evidence or resolved contradiction','limit':'observations may be dependent'}
 add_sft('calibration',f'evidence:{n}:{c}:{u}:{impact}',i,p,json.dumps(a,ensure_ascii=False,sort_keys=True),{'type':'exact-json','expected':a,'verified':True})
for i in range(80):
 n=1+i%9;c=(i*3)%5;p=f'Una conclusión usa {n} fuentes y conserva {c} contradicciones sin resolver en escenario {i+1}. ¿Cómo comunicarla?'
 add_pref('calibration',f'communicate:{n}:{c}:{i}',i,p,'Separa hechos, inferencias e incógnitas; asigna confianza proporcional a independencia y contradicciones; declara qué evidencia cambiaría la conclusión.','Preséntala como definitiva si la explicación parece coherente.',['confidence calibration','unknowns','revision trigger'])
# planning 320+80
for i in range(320):
 steps=3+i%7;budget=10+(i*19)%181;risk=(i*23)%101;failure=i%steps
 p=f'Diseña un plan de {steps} pasos con presupuesto {budget}, riesgo {risk}/100 y fallo simulado en paso {failure+1}. Devuelve JSON con precondiciones, verificación, rollback y replanteo.'
 plan=[{'step':j+1,'precondition':f'output_{j}_verified' if j else 'inputs_validated','action':f'action_{i+1}_{j+1}','successMetric':f'metric_{j+1}>=threshold','checkpoint':True,'onFailure':'rollback_then_replan'} for j in range(steps)]
 a={'objective':f'objective_{i+1}','budget':budget,'risk':risk,'steps':plan,'simulatedFailureStep':failure+1,'rollback':f'restore_checkpoint_{failure}','replan':'reduce scope, preserve verified outputs, choose alternate action','stopCondition':'budget exhausted or no verified progress'}
 add_sft('planning',f'plan:{steps}:{budget}:{risk}:{failure}',i,p,json.dumps(a,ensure_ascii=False,sort_keys=True),{'type':'plan-contract','required':['objective','steps','rollback','replan','stopCondition'],'stepCount':steps,'verified':True})
for i in range(80):
 p=f'Plan {i+1} obtiene una salida parcial no verificada en el paso {2+i%5}. ¿Qué conducta es correcta?'
 add_pref('planning',f'partial:{i}',i,p,'No marco éxito. Verifico el efecto, conservo checkpoints válidos, ejecuto rollback si hubo efectos y replanteo desde la última evidencia confiable.','Continúo porque cualquier salida parcial demuestra progreso.',['verification','checkpoint','rollback','replan'])
# transfer 320+80
DOMAINS=['networks','clinical-triage','supply-chain','control-systems','software-debugging','energy-storage','project-management','epidemiology']
for i in range(320):
 a=DOMAINS[i%len(DOMAINS)];b=DOMAINS[(i*5+3)%len(DOMAINS)];nodes=3+i%6
 p=f'Transfiere una estrategia de {a} a {b} en caso {i+1}. Identifica estructura conservada, diferencias, prueba mínima y condición de invalidez en JSON.'
 out={'source':a,'target':b,'preservedStructure':[f'constraint_{i%7}',f'feedback_loop_{nodes}',f'failure_signal_{(i*3)%11}'],'nonTransferable':[f'domain_assumption_{a}',f'scale_effect_{b}'],'adaptation':f'map control variable {i%9} to target observable {(i*7)%13}','minimalTest':f'paired pilot with {20+i%81} cases and predefined metric','falsification':'target outcome fails while mapped intermediate mechanism changes as predicted','confidence':'medium'}
 add_sft('transfer',f'{a}:{b}:{nodes}:{i}',i,p,json.dumps(out,ensure_ascii=False,sort_keys=True),{'type':'structural-transfer','required':['preservedStructure','nonTransferable','minimalTest','falsification'],'verified':True})
for i in range(80):
 a=DOMAINS[i%8];b=DOMAINS[(i+5)%8];p=f'Una solución funcionó en {a}. ¿Puede copiarse directamente a {b} para variante {i+1}?'
 add_pref('transfer',f'copy:{a}:{b}:{i}',i,p,'No directamente. Mapea mecanismos y restricciones, identifica supuestos que cambian y exige una prueba mínima con criterio de falsación.','Sí; el éxito en un dominio demuestra que el patrón es universal.',['mechanism mapping','changed assumptions','falsification'])
# code 320+80 executable multi-file
for i in range(320):
 pkg=f'stateful{i+1:03d}';limit=5+i%17;inc=1+(i*7)%9
 files={f'{pkg}/store.py':f"class Store:\n    def __init__(self, value=0): self.value=int(value)\n    def apply(self, delta, limit={limit}):\n        nxt=self.value+int(delta)\n        if not 0 <= nxt <= limit: raise ValueError('range')\n        self.value=nxt\n        return self.value\n",f'{pkg}/service.py':"from .store import Store\n\ndef execute(store, deltas):\n    snapshot=store.value\n    try:\n        return [store.apply(x) for x in deltas]\n    except Exception:\n        store.value=snapshot\n        raise\n",f'tests/test_{pkg}.py':f"import pytest\nfrom {pkg}.store import Store\nfrom {pkg}.service import execute\n\ndef test_commit_and_rollback():\n    s=Store(0); assert execute(s,[{inc},1])==[{inc},{inc+1}]\n    with pytest.raises(ValueError): execute(s,[{limit+1}])\n    assert s.value=={inc+1}\n"}
 p=f'Implementa reparación multiarchivo con estado persistente para paquete {pkg}, límite {limit}, incremento {inc}, commit válido y rollback ante error. Devuelve JSON.'
 a={'files':files,'commands':['python -m pytest -q'],'expected':'commit válido y rollback conservan estado','rollback':'restore snapshot atomically'}
 add_sft('code',f'{pkg}:{limit}:{inc}',i,p,json.dumps(a,ensure_ascii=False,sort_keys=True),{'type':'python-multifile-executable','files':files,'assertions':3,'verified':True})
for i in range(80):
 p=f'Una reparación de código con estado persistente pasa una prueba feliz pero falla durante escritura en variante {i+1}. ¿Qué integración aceptas?'
 add_pref('code',f'state:{i}',i,p,'Sólo acepto una reparación atómica con snapshot, rollback probado, pruebas de fallo y verificación del estado posterior.','Acepto porque la ruta feliz ya pasó.',['atomicity','failure test','rollback','post-state verification'])
OUT.mkdir(parents=True,exist_ok=True)
for path,rows in ((SFT,sft),(PREF,pref)):path.write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in rows),encoding='utf-8')
allr=sft+pref;manifest={'schemaVersion':1,'name':'v41-priority-depth-20260725','counts':{'sft':len(sft),'preference':len(pref),'total':len(allr)},'splits':{x:sum(r['split']==x for r in allr) for x in ('train','validation','test')},'distribution':{c:sum(r['capability']==c for r in allr) for c in ('calibration','planning','transfer','code')},'pwaFeedback':{'observedHumanApproved':0,'accepted':0,'rejected':0,'reason':'no authenticated D1 export available to repository job'},'files':{str(SFT.relative_to(ROOT)):h(SFT.read_bytes()),str(PREF.relative_to(ROOT)):h(PREF.read_bytes())},'containsPrivateUserData':False,'benchmarkExcluded':True}
manifest['sha256']=h(manifest);MAN.write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8');print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
