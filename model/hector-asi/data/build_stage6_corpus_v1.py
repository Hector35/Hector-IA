#!/usr/bin/env python3
import argparse,hashlib,json
from collections import Counter
from pathlib import Path

CAPS=['mathematics','code','planning','tools','causality','verification','calibration','metacognition']
SEED=62026

def row(cap,j):
    d=j%4+1; idx=CAPS.index(cap)*256+j
    if cap=='mathematics':
        a=17+((j*37)%900); b=11+((j*53+7)%700); c=2+(j%19); value=a*b+c*c
        prompt=f'Calcula exactamente (({a} * {b}) + {c}^2) y verifica el resultado con una operación inversa.'
        answer=f'Resultado: {value}. Verificación: ({value} - {c*c}) / {a} = {b}.'
        verifier={'type':'numeric_exact','expected':value}
    elif cap=='code':
        n=5+(j%18); k=2+(j%7); fn=f'window_sums_{idx}'
        prompt=f'Escribe una función Python `{fn}(xs)` que devuelva las sumas de ventanas contiguas de tamaño {k}; para listas menores que {k}, devuelve []. No uses librerías externas.'
        answer=f'def {fn}(xs):\n    return [sum(xs[i:i+{k}]) for i in range(len(xs)-{k}+1)]'
        verifier={'type':'python_tests','tests':[f'assert {fn}(list(range({n}))) == [sum(range(i,i+{k})) for i in range({n}-{k}+1)]',f'assert {fn}([1]*{k-1}) == []']}
    elif cap=='planning':
        budget=100+(j%50)*10; steps=4+(j%5)
        prompt=f'Diseña un plan de {steps} pasos para completar una migración con presupuesto máximo {budget} unidades, una dependencia entre pasos 2 y 3, un rollback y un criterio de salida medible.'
        answer=f'1) Inventario (≤{budget//5}). 2) Copia y validación (≤{budget//5}). 3) Migración sólo tras aprobar paso 2 (≤{budget//3}). 4) Verificación final (resto). Rollback: restaurar copia del paso 2. Salida: 100% de pruebas críticas aprobadas y costo total ≤{budget}.'
        verifier={'type':'rubric','required':['dependencia','rollback',f'≤{budget}','100%']}
    elif cap=='tools':
        name=f'registro-{idx}.json'
        prompt=f'Debes localizar el archivo `{name}` y después leerlo. Produce únicamente un plan de llamadas con nombre de herramienta y argumentos; no inventes el contenido.'
        answer=json.dumps([{'tool':'search_files','args':{'query':name}},{'tool':'read_file','args':{'path':'<resultado_de_search_files>'}}],ensure_ascii=False)
        verifier={'type':'json_schema','steps':2,'tools':['search_files','read_file'],'forbid_content_claims':True}
    elif cap=='causality':
        x=3+(j%20); observed=2*x+5; intervention=2*(x+1)+5; counterfactual=2*(x-1)+5
        prompt=f'En un sistema Y=2X+5, se observa X={x}, Y={observed}. Distingue observación, intervención do(X={x+1}) y contrafactual para la misma unidad si X hubiera sido {x-1}.'
        answer=f'Observación: X={x}, Y={observed}. Intervención do(X={x+1}) produce Y={intervention}. Contrafactual con X={x-1} produce Y={counterfactual}, manteniendo la ecuación estructural.'
        verifier={'type':'structured_values','expected':[observed,intervention,counterfactual]}
    elif cap=='verification':
        claim=1000+idx
        prompt=f"Evalúa la afirmación: 'el artefacto tiene {claim} bytes'. Sólo hay un manifiesto que reporta {claim}, pero no se ha medido el archivo. Separa hecho, inferencia y acción de verificación."
        answer=f'Hecho: el manifiesto reporta {claim} bytes. Inferencia: el archivo podría tener ese tamaño, pero no está confirmado. Acción: medir el archivo y comparar tamaño y SHA-256 antes de aceptar la afirmación.'
        verifier={'type':'rubric','required':['Hecho','Inferencia','medir','SHA-256']}
    elif cap=='calibration':
        successes=55+(j%40); p=successes/100
        prompt=f'Un clasificador acierta {successes} de 100 casos independientes. Estima probabilidad empírica, expresa incertidumbre y evita afirmar certeza.'
        answer=f'Estimación empírica: {p:.2f}. Es una estimación muestral, no certeza; debe acompañarse de un intervalo de confianza o más datos antes de generalizar.'
        verifier={'type':'calibration','probability':p,'required':['no certeza','intervalo']}
    else:
        wrong=12+(j%30); correct=wrong*wrong
        prompt=f'Una solución afirma que {wrong}²={correct+1}. Diagnostica el error, corrígelo y explica qué comprobación habría evitado el fallo.'
        answer=f'Error: el cuadrado fue calculado con +1. Corrección: {wrong}²={correct}. Comprobación: multiplicar {wrong}×{wrong} o verificar con una segunda operación independiente.'
        verifier={'type':'rubric','required':[str(correct),'multiplicar','independiente']}
    return {'id':f's6-{cap}-{j:04d}','capability':cap,'difficulty':d,'split':'train' if j<224 else 'validation','messages':[{'role':'user','content':prompt},{'role':'assistant','content':answer}],'verifier':verifier,'license':'Apache-2.0','provenance':{'kind':'deterministic-author-generated','generator':'stage6-corpus-v1','seed':SEED}}

def build(): return [row(cap,j) for cap in CAPS for j in range(256)]

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--output',required=True); parser.add_argument('--manifest',required=True); args=parser.parse_args()
    rows=build(); payload=''.join(json.dumps(item,ensure_ascii=False,separators=(',',':'))+'\n' for item in rows).encode(); out=Path(args.output); out.parent.mkdir(parents=True,exist_ok=True); out.write_bytes(payload)
    manifest={'schemaVersion':1,'id':'stage6-corpus-v1','status':'generated-not-yet-canonical','examples':len(rows),'train':sum(x['split']=='train' for x in rows),'validation':sum(x['split']=='validation' for x in rows),'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload),'capabilities':dict(Counter(x['capability'] for x in rows)),'difficulty':{str(k):v for k,v in sorted(Counter(x['difficulty'] for x in rows).items())},'licenses':['Apache-2.0'],'provenance':['deterministic-author-generated'],'generatorSeed':SEED,'benchmarkContamination':{'checked':False,'reason':'Benchmark V2 is not yet integrated into main'}}
    Path(args.manifest).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(manifest,ensure_ascii=False))
if __name__=='__main__': main()
