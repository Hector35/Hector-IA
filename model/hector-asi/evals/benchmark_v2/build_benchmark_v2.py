from __future__ import annotations
import argparse,hashlib,json,random
from collections import Counter
from pathlib import Path
SEED=4102
CATEGORIES=("mathematics","code","planning","tool_use","causality","calibration","metacognition","transfer")
SYSTEM_PROMPT="Responde en español. Resuelve la tarea con precisión; usa evidencia o verificación cuando corresponda y no inventes información ausente."
def sha256(p):
 h=hashlib.sha256()
 with open(p,"rb") as f:
  for c in iter(lambda:f.read(1<<20),b""):h.update(c)
 return h.hexdigest()
def mathematics(i):
 a=17+(i*13)%83;b=11+(i*19)%71;c=3+(i*7)%17
 return {"prompt":f"Calcula {a}×{b}−{c}. Incluye una verificación por descomposición. Caso {i+1}.","verifier":{"type":"numeric","expected":a*b-c,"tolerance":0},"difficulty":1+i//16}
def code(i):
 n=4+i%9;m=i%4;tag=f" Variante controlada {i+1}."
 if m==0:
  p=f"Escribe una función Python `solve(xs)` que devuelva los {n} valores mayores sin modificar `xs`."+tag;t=[[ [5,1,9,2,7,3,8,4,6] ],[ [2,2,1,3,3] ]];e=[sorted(t[0][0],reverse=True)[:n],sorted(t[1][0],reverse=True)[:n]]
 elif m==1:
  p="Escribe `solve(text)` que cuente palabras ignorando mayúsculas y signos básicos y devuelva un dict."+tag;t=[["Uno, dos dos; TRES tres tres."],["A a B"]];e=[{"uno":1,"dos":2,"tres":3},{"a":2,"b":1}]
 elif m==2:
  p="Escribe `solve(rows)` que agrupe pares `(categoria, valor)` y sume sólo valores numéricos finitos."+tag;t=[[[["a",2],["b",3],["a",4]]],[[["x",1.5],["x",2.5]]]];e=[{"a":6,"b":3},{"x":4.0}]
 else:
  p="Escribe `solve(graph, start)` que devuelva por BFS las distancias mínimas; omite nodos inaccesibles."+tag;t=[[{"a":["b","c"],"b":["d"],"c":[],"d":[]},"a"],[{"x":[],"y":[]},"x"]];e=[{"a":0,"b":1,"c":1,"d":2},{"x":0}]
 return {"prompt":p,"verifier":{"type":"python_function","entrypoint":"solve","tests":[{"input":x,"expected":y} for x,y in zip(t,e)],"timeoutSeconds":2},"difficulty":2+i//20}
def rubric(category,i):
 v={
 "planning":("Un servicio falla intermitentemente después de un despliegue. Diseña un plan reversible y priorizado.",["aislar","métrica","hipótesis","rollback","verificar"],["cambiar todo","sin medir"]),
 "tool_use":("Debes responder una pregunta cuyo dato cambia diariamente. Explica herramienta, validación y registro.",["consultar","fuente","fecha","citar","validar"],["memoria","inventar"]),
 "causality":("Dos métricas subieron juntas después de una campaña. Explica qué concluir y diseña una prueba causal.",["correlación","confusor","control","intervención","medir"],["demuestra causalidad"]),
 "calibration":("La evidencia es parcial y contradictoria. Da una conclusión calibrada sin porcentajes inventados.",["incertidumbre","evidencia","no se puede","faltan","actualizar"],["seguro","100%"]),
 "metacognition":("Resuelve una decisión técnica y señala qué podría estar equivocado y cómo comprobarlo.",["supuesto","podría","comprobar","prueba","criterio"],["infalible"]),
 "transfer":("Aplica separación de responsabilidades a un sistema no informático y justifica analogía y límites.",["responsabilidad","interfaz","aislar","analogía","límite"],["idéntico"])}
 base,req,bad=v[category];contexts=("Prioriza costo y reversibilidad.","Incluye criterios de parada.","Distingue hechos, inferencias y decisiones.","Incluye un caso que refutaría tu hipótesis.")
 return {"prompt":f"{base} {contexts[i%4]} Escenario independiente {i+1}.","verifier":{"type":"structured_rubric","requiredConcepts":req,"forbiddenClaims":bad,"minimumConcepts":4,"judgePolicy":"two-independent-judges-plus-rules"},"difficulty":2+i//16}
def case(cat,i):
 body=mathematics(i) if cat=="mathematics" else code(i) if cat=="code" else rubric(cat,i)
 return {"id":f"hv2-{cat[:4]}-{i:03d}","benchmarkVersion":"2.0.0","split":"hidden","category":cat,"systemPrompt":SYSTEM_PROMPT,"generation":{"doSample":False,"temperature":0,"maxNewTokens":256},"provenance":"deterministic-author-generated","license":"Apache-2.0-compatible",**body}
def build(out):
 random.seed(SEED);out.mkdir(parents=True,exist_ok=True);rows=[case(c,i) for c in CATEGORIES for i in range(64)];random.shuffle(rows)
 prompts=[" ".join(x["prompt"].lower().split()) for x in rows];counts=Counter(x["category"] for x in rows)
 assert len(rows)==len({x["id"] for x in rows})==len(set(prompts))==512;assert counts==Counter({c:64 for c in CATEGORIES})
 hidden=out/"hidden.jsonl";hidden.write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True)+"\n" for x in rows),encoding="utf-8")
 manifest={"schemaVersion":1,"benchmarkVersion":"2.0.0","status":"canonical-candidate","seed":SEED,"hiddenCases":512,"categoryCounts":dict(sorted(counts.items())),"systemPrompt":SYSTEM_PROMPT,"generation":{"doSample":False,"temperature":0,"maxNewTokens":256},"scoring":{"numeric":"parsed numeric equality/tolerance","code":"isolated executable tests with timeout","openEnded":"deterministic concept rules plus two independent calibrated judges"},"hiddenSha256":sha256(hidden),"contaminationPolicy":"exact and semantic similarity exclusion from all training/validation corpora","promotionGate":{"minimumAbsoluteGainPoints":3.0,"noSevereCategoryRegression":True}}
 (out/"manifest.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False,sort_keys=True)+"\n",encoding="utf-8");print(json.dumps(manifest,indent=2,ensure_ascii=False,sort_keys=True))
def main():
 p=argparse.ArgumentParser();p.add_argument("--out",type=Path,required=True);build(p.parse_args().out)
if __name__=="__main__":main()
