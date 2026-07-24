#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const here=path.dirname(new URL(import.meta.url).pathname);
const sourcePath=path.join(here,'canonical-source-20260724-1329.json');
const outputPath=path.join(here,'canonical-20260724-1329.jsonl');
const manifestPath=path.join(here,'canonical-20260724-1329.manifest.json');
const source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const rows=[];
const system='Responde con precisión, separa hechos de supuestos y verifica el resultado antes de concluir.';

function hash(value){return crypto.createHash('sha256').update(value).digest('hex')}
function add(capability,difficulty,prompt,answer,verifier,family){
  const row={id:`s6-${String(rows.length+1).padStart(6,'0')}`,format:'qwen-chat',type:'sft',messages:[{role:'system',content:system},{role:'user',content:prompt},{role:'assistant',content:answer}],metadata:{capability,difficulty,verifier,source:`synthetic-deterministic:${family}`,license:'CC0-1.0',benchmark_excluded:true}};
  row.metadata.content_sha256=hash(JSON.stringify(row));
  rows.push(row);
}
function hm(minutes){return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`}
function toBase(value,base){const digits='0123456789ABCDEF';if(value===0)return'0';let n=value,out='';while(n){const r=n%base;n=Math.floor(n/base);out=digits[r]+out}return out}

for(let i=0;i<80;i++){
  const a=101+i*7,b=3+(i%31),c=2+(i%19),expected=a*b+c*c;
  add('mathematics',i<40?'easy':'medium',`Calcula y verifica: (${a} × ${b}) + ${c}². Muestra la sustitución y el resultado final.`,`Sustitución: (${a} × ${b}) + ${c}² = ${a*b} + ${c*c}. Resultado: ${expected}. Verificación: ${expected} - ${c*c} = ${a*b}, que coincide con ${a} × ${b}.`,{kind:'exact_numeric',expected},'arithmetic_v1');
}
for(let i=0;i<80;i++){
  const x=-40+i,m=(i%2===0?1:-1)*(2+(i%11)),k=-90+i*3,rhs=m*x+k;
  add('mathematics','medium',`Resuelve la ecuación ${m}x + (${k}) = ${rhs}. Incluye una comprobación sustituyendo x.`,`Restando ${k} en ambos lados: ${m}x = ${rhs-k}. Dividiendo entre ${m}: x = ${x}. Comprobación: ${m}(${x}) + (${k}) = ${m*x+k} = ${rhs}.`,{kind:'linear_equation',expected_x:x},'linear_equation_v1');
}
for(let i=0;i<80;i++){
  const n=8+i,expected=Array.from({length:n},(_,j)=>j+1).filter(x=>x%2===0).reduce((s,x)=>s+x*x,0);
  const answer=`\`\`\`python\ndef sum_even_squares(values):\n    return sum(x * x for x in values if isinstance(x, int) and not isinstance(x, bool) and x % 2 == 0)\n\`\`\`\n\nPrueba: \`sum_even_squares(list(range(1, ${n+1})))\` devuelve \`${expected}\`. La función filtra enteros pares y luego suma sus cuadrados.`;
  add('code',i<40?'easy':'medium',`Escribe una función Python \`sum_even_squares(values)\` que sume los cuadrados de los enteros pares. Debe ignorar valores no enteros. Incluye una prueba con \`list(range(1,${n+1}))\`.`,answer,{kind:'python_exec',test:{range_end:n,expected}},'python_even_squares_v1');
}
for(let i=0;i<80;i++){
  const base=2+(i%15),value=73+i*61,expected=toBase(value,base);
  const answer=`\`\`\`python\ndef to_base(n, base):\n    if not isinstance(n, int) or isinstance(n, bool) or n < 0:\n        raise ValueError("n debe ser entero no negativo")\n    if not 2 <= base <= 16:\n        raise ValueError("base fuera de rango")\n    digits = "0123456789ABCDEF"\n    if n == 0:\n        return "0"\n    out = []\n    while n:\n        n, r = divmod(n, base)\n        out.append(digits[r])\n    return "".join(reversed(out))\n\`\`\`\n\n\`to_base(${value}, ${base})\` devuelve \`${expected}\`. Verificación inversa: \`int("${expected}", ${base}) == ${value}\`.`;
  add('code','medium',`Implementa en Python \`to_base(n, base)\` para convertir un entero no negativo a base 2–16, sin usar \`format\`. Demuestra el resultado para n=${value}, base=${base}.`,answer,{kind:'python_property',expected,inverse:value},'python_base_conversion_v1');
}
for(let i=0;i<80;i++){
  const durations={A:20+(i%31),B:15+((i*3)%29),C:10+((i*5)%27),D:15+((i*7)%25)};
  let minute=(8+(i%3))*60;const schedule=[];
  for(const name of ['A','B','C','D']){const start=minute,end=start+durations[name];schedule.push({name,start,end});minute=end;if(name==='B')minute+=10}
  const total=Object.values(durations).reduce((a,b)=>a+b,0);
  const lines=schedule.map(x=>`${x.name}: ${hm(x.start)}–${hm(x.end)}`).join('\n- ');
  const prompt=`Planifica cuatro tareas para una sola persona desde las ${hm((8+(i%3))*60)}. Duraciones: A=${durations.A} min, B=${durations.B} min, C=${durations.C} min, D=${durations.D} min. Restricciones: A antes de C, B antes de D, una pausa de 10 min tras dos tareas, sin solapamientos. Entrega horario y verifica todas las restricciones.`;
  const answer=`Horario:\n- ${lines}\n- Pausa: ${hm(schedule[1].end)}–${hm(schedule[1].end+10)}\n\nVerificación: no hay solapamientos; A termina antes de C; B termina antes de D; la pausa ocurre exactamente después de dos tareas. Tiempo total de trabajo: ${total} min.`;
  add('planning',i<55?'medium':'hard',prompt,answer,{kind:'schedule_constraints',durations,precedence:[['A','C'],['B','D']],break_minutes:10},'schedule_precedence_v1');
}
for(let i=0;i<80;i++){
  const x=1+(i%9),a=2+(i%6),b=-5+(i%15),c=1+(i%5),x2=x+(i%2===0?2:-1),m=a*x+b,y=c*m,m2=a*x2+b,y2=c*m2;
  const prompt=`Modelo causal estructural: M = ${a}X + (${b}); Y = ${c}M. Con X=${x}, calcula M e Y. Luego aplica la intervención do(X=${x2}) y calcula el nuevo Y. Distingue observación de intervención.`;
  const answer=`Observación con X=${x}: M=${a}·${x}+(${b})=${m}; Y=${c}·${m}=${y}. Intervención do(X=${x2}): se fija X en ${x2}; entonces M=${a}·${x2}+(${b})=${m2} y Y=${c}·${m2}=${y2}. La primera parte evalúa el modelo bajo el valor observado; la segunda reemplaza estructuralmente el valor de X.`;
  add('causal_reasoning','medium',prompt,answer,{kind:'scm_exact',observed_y:y,intervened_y:y2},'linear_scm_v1');
}
for(let i=0;i<80;i++){
  const a=20+i*11,b=17+i*7,mode=i%4;let statement,label,why;
  if(mode===0){statement=`El valor de ${a}+${b} puede determinarse exactamente con aritmética.`;label='alta';why='Es una operación determinista y puede comprobarse por resta.'}
  else if(mode===1){statement=`Un modelo no ejecutado aprobará exactamente ${2+i%17} de ${7+i%23} tests ocultos.`;label='muy baja';why='No hay ejecución ni acceso a los tests ocultos; el número concreto carece de evidencia.'}
  else if(mode===2){statement=`Un archivo con SHA-256 recalculado igual al hash registrado no cambió entre ambas mediciones.`;label='alta';why='La igualdad del hash aporta evidencia criptográfica extremadamente fuerte bajo el supuesto de cálculo correcto.'}
  else{statement=`Una planificación de ${3+i%9} tareas sin revisar dependencias terminará antes de ${1+i%6} horas.`;label='baja';why='Faltan duraciones, dependencias, recursos y contingencias para sostener el plazo.'}
  add('calibration',i<40?'easy':'medium',`Calibra la confianza como alta, media, baja o muy baja y justifica: «${statement}»`,`Confianza: ${label}. Justificación: ${why}`,{kind:'label_exact',expected_label:label},'confidence_label_v1');
}
for(let i=0;i<80;i++){
  const a=31+i*3,b=19+i*5,correct=a+b,wrong=correct+(i%2===0?2:-3);
  const prompt=`Un solucionador afirma que ${a}+${b}=${wrong}. Audita la respuesta: identifica el error, da el resultado correcto y propone una verificación independiente.`;
  const answer=`La afirmación es incorrecta: ${a}+${b}=${correct}, no ${wrong}. Una verificación independiente es restar: ${correct}-${a}=${b}; en cambio, ${wrong}-${a}=${wrong-a}, que no coincide con ${b}.`;
  add('verification',i<40?'easy':'medium',prompt,answer,{kind:'arithmetic_audit',expected:correct,incorrect_claim:wrong},'arithmetic_audit_v1');
}

const prompts=new Set(),answers=new Set(),ids=new Set(),failures=[];
for(const row of rows){const prompt=row.messages[1].content,answer=row.messages[2].content;if(ids.has(row.id))failures.push(`id duplicado ${row.id}`);ids.add(row.id);if(prompts.has(prompt))failures.push(`prompt duplicado ${row.id}`);prompts.add(prompt);if(answers.has(answer))failures.push(`respuesta duplicada ${row.id}`);answers.add(answer);if(!row.metadata.verifier?.kind)failures.push(`sin verificador ${row.id}`)}
if(rows.length!==source.targetCount)failures.push(`conteo ${rows.length} != ${source.targetCount}`);
if(failures.length)throw new Error(failures.join('\n'));
const jsonl=rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
fs.writeFileSync(outputPath,jsonl);
const byCapability=Object.fromEntries([...new Set(rows.map(x=>x.metadata.capability))].sort().map(key=>[key,rows.filter(x=>x.metadata.capability===key).length]));
const byDifficulty=Object.fromEntries([...new Set(rows.map(x=>x.metadata.difficulty))].sort().map(key=>[key,rows.filter(x=>x.metadata.difficulty===key).length]));
const manifest={schemaVersion:1,stage:6,batchId:'stage6-canonical-20260724-1329',targetModel:'Qwen/Qwen3.5-397B-A17B',examples:rows.length,rawGenerated:rows.length,rejected:0,rejectionRate:0,sha256:hash(jsonl),bytes:Buffer.byteLength(jsonl),format:'qwen-chat',license:'CC0-1.0',benchmarkExcluded:true,capabilities:byCapability,difficulty:byDifficulty,multimodal:{examples:0,status:'deferred-until-image-assets-and-ground-truth'},qualityGates:{exactPromptDuplicates:0,exactAnswerDuplicates:0,allHaveVerifier:true,allHaveProvenance:true,allBenchmarkExcluded:true},createdAt:new Date().toISOString()};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({ok:true,outputPath,manifestPath,...manifest}));
