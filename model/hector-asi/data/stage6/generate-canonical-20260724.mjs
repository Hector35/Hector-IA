import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const root=process.cwd();
const outDir=resolve(root,'model/hector-asi/data/stage6/generated');
const sftPath=resolve(outDir,'canonical-sft-20260724.jsonl');
const prefPath=resolve(outDir,'canonical-preference-20260724.jsonl');
const manifestPath=resolve(root,'model/hector-asi/data/stage6/latest-batch.json');
const hiddenCandidates=[resolve(root,'model/hector-asi/evals/benchmark-v2/hidden.jsonl'),resolve(root,'model/hector-asi/evals/held-out-v1.jsonl')];
const system='Eres Héctor ASI. Resuelve con precisión, separa hechos de inferencias y entrega resultados verificables.';
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const difficulty=index=>['fácil','media','difícil'][index%3];
const normalize=value=>value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const fixed=value=>Number.isInteger(value)?String(value):String(Number(value.toFixed(6)));
const sft=[];
const preference=[];

function addSft({id,capability,user,assistant,verification,family,index,modality='text'}){
  const row={id,format:'chat-sft',capability,difficulty:difficulty(index),modality,messages:[{role:'system',content:system},{role:'user',content:user},{role:'assistant',content:assistant}],verification:{...verification,verified:true},provenance:{kind:'project-authored-deterministic-synthetic',license:'CC0-1.0',containsPrivateUserData:false,generator:'generate-canonical-20260724.mjs'},benchmark_excluded:true,semantic_key:`${capability}:${family}:${index}`};
  row.sha256=sha(row);sft.push(row);
}

function addPreference({id,capability,user,chosen,rejected,criteria,family,index}){
  const row={id,format:'preference',capability,difficulty:difficulty(index),modality:'text',prompt:[{role:'system',content:system},{role:'user',content:user}],chosen,rejected,verification:{type:'rubric',verified:true,criteria},provenance:{kind:'project-authored-deterministic-synthetic',license:'CC0-1.0',containsPrivateUserData:false,generator:'generate-canonical-20260724.mjs'},benchmark_excluded:true,semantic_key:`${capability}:${family}:${index}`};
  row.sha256=sha(row);preference.push(row);
}

const mathFamilies=[
  i=>{const a=2+i%7,x=3+(i*5)%29,b=1+(i*3)%13,c=a*x+b;return{family:'linear',user:`Resuelve ${a}x + ${b} = ${c} y verifica sustituyendo.`,assistant:`Restando ${b}: ${a}x=${c-b}. Dividiendo entre ${a}: x=${x}. Verificación: ${a}·${x}+${b}=${c}.`,expected:x};},
  i=>{const base=120+(i*17)%700,pct=[5,10,12.5,15,20,25,30,40][i%8],result=base*pct/100;return{family:'percentage',user:`Calcula ${pct}% de ${base} y explica la operación.`,assistant:`${pct}% = ${pct}/100. Entonces ${base}·${pct}/100=${fixed(result)}.`,expected:result};},
  i=>{const r1=2+i%6,r2=3+(i*2)%7,k=4+i%19,total=(r1+r2)*k;return{family:'ratio',user:`Divide ${total} en la razón ${r1}:${r2}.`,assistant:`La suma de partes es ${r1+r2}; cada parte vale ${k}. Los valores son ${r1*k} y ${r2*k}.`,expected:[r1*k,r2*k]};},
  i=>{const start=4+(i*3)%25,d=2+i%9,n=6+i%14,result=start+(n-1)*d;return{family:'sequence',user:`En una sucesión aritmética que inicia en ${start} y aumenta ${d}, calcula el término ${n}.`,assistant:`a_${n}=${start}+(${n}-1)·${d}=${result}.`,expected:result};},
  i=>{const w=3+i%17,h=5+(i*2)%19,area=w*h,perimeter=2*(w+h);return{family:'rectangle',user:`Un rectángulo mide ${w} por ${h}. Calcula área y perímetro.`,assistant:`Área=${w}·${h}=${area}. Perímetro=2(${w}+${h})=${perimeter}.`,expected:{area,perimeter}};},
  i=>{const good=2+i%8,total=good+3+(i*2)%9,p=good/total;return{family:'probability',user:`Una urna tiene ${good} elementos favorables de ${total} en total. ¿Cuál es la probabilidad de extraer uno favorable?`,assistant:`Probabilidad=${good}/${total}=${fixed(p)} (${fixed(p*100)}%).`,expected:p};},
  i=>{const km=1+(i*7)%80,meters=km*1000;return{family:'units',user:`Convierte ${km} km a metros y muestra el factor de conversión.`,assistant:`1 km=1000 m; ${km}·1000=${meters} m.`,expected:meters};},
  i=>{const a=60+(i*5)%40,b=70+(i*7)%30,wa=2+i%4,wb=3+(i*2)%5,result=(a*wa+b*wb)/(wa+wb);return{family:'weighted-average',user:`Calcula el promedio ponderado de ${a} con peso ${wa} y ${b} con peso ${wb}.`,assistant:`(${a}·${wa}+${b}·${wb})/(${wa}+${wb})=${fixed(result)}.`,expected:result};}
];
for(let i=0;i<160;i++){const item=mathFamilies[i%mathFamilies.length](i);addSft({id:`stage6-math-${String(i+1).padStart(3,'0')}`,capability:'mathematics',user:item.user,assistant:item.assistant,verification:{type:'exact-structured',expected:item.expected},family:item.family,index:i});}

const codeFamilies=[
  {name:'sum_even',body:n=>`def ${n}(values):\n    return sum(x for x in values if x % 2 == 0)`,test:n=>`assert ${n}([1,2,3,4,6]) == 12\nassert ${n}([]) == 0`},
  {name:'clamp',body:n=>`def ${n}(value, low, high):\n    if low > high:\n        raise ValueError('low must be <= high')\n    return max(low, min(high, value))`,test:n=>`assert ${n}(12,0,10) == 10\nassert ${n}(-2,0,10) == 0\nassert ${n}(4,0,10) == 4`},
  {name:'dedupe_preserve',body:n=>`def ${n}(values):\n    seen=set()\n    return [x for x in values if not (x in seen or seen.add(x))]`,test:n=>`assert ${n}([3,1,3,2,1]) == [3,1,2]\nassert ${n}([]) == []`},
  {name:'frequency_count',body:n=>`def ${n}(values):\n    out={}\n    for value in values:\n        out[value]=out.get(value,0)+1\n    return out`,test:n=>`assert ${n}(['a','b','a']) == {'a':2,'b':1}\nassert ${n}([]) == {}`},
  {name:'chunk',body:n=>`def ${n}(values, size):\n    if size <= 0:\n        raise ValueError('size must be positive')\n    return [values[i:i+size] for i in range(0,len(values),size)]`,test:n=>`assert ${n}([1,2,3,4,5],2) == [[1,2],[3,4],[5]]\nassert ${n}([],3) == []`},
  {name:'safe_divide',body:n=>`def ${n}(a, b, default=None):\n    return default if b == 0 else a / b`,test:n=>`assert ${n}(8,2) == 4\nassert ${n}(8,0,'x') == 'x'`},
  {name:'moving_average',body:n=>`def ${n}(values, window):\n    if window <= 0:\n        raise ValueError('window must be positive')\n    if window > len(values):\n        return []\n    return [sum(values[i:i+window])/window for i in range(len(values)-window+1)]`,test:n=>`assert ${n}([1,2,3,4],2) == [1.5,2.5,3.5]\nassert ${n}([1],2) == []`},
  {name:'normalize_words',body:n=>`def ${n}(text):\n    return sorted(set(word.strip('.,!?;:').lower() for word in text.split() if word.strip('.,!?;:')))`,test:n=>`assert ${n}('Hola, hola MUNDO!') == ['hola','mundo']\nassert ${n}('') == []`}
];
for(let i=0;i<160;i++){const family=codeFamilies[i%codeFamilies.length],fn=`${family.name}_${String(i+1).padStart(3,'0')}`,code=family.body(fn),test=family.test(fn);addSft({id:`stage6-code-${String(i+1).padStart(3,'0')}`,capability:'code',user:`Implementa en Python la función ${fn}. Debe manejar casos límite y ser comprobable con tests.`,assistant:`\`\`\`python\n${code}\n\`\`\``,verification:{type:'python-tests',code,test},family:family.name,index:i});}

const planningContexts=['migración de base de datos','despliegue móvil','corrección de seguridad','actualización de dependencia','entrenamiento reanudable','recuperación de incidente','auditoría de costos','integración de API'];
const environments=['producción','staging','entorno aislado','canary','réplica de datos'];
for(let i=0;i<80;i++){
  const context=planningContexts[i%planningContexts.length],hours=2+(i%7),checks=2+(i%4),team=1+(i*3)%9,environment=environments[i%environments.length],risk=['bajo','medio','alto'][i%3];
  const user=`Caso P${i+1}: diseña un plan para ${context} en ${environment}, con equipo de ${team}, riesgo ${risk}, ventana de ${hours} horas, rollback obligatorio y ${checks} verificaciones independientes.`;
  const assistant=`Para el caso P${i+1}: 1. Congelar alcance y registrar estado inicial de ${environment}. 2. Asignar responsables dentro del equipo de ${team}. 3. Reproducir y fijar criterios de éxito acordes al riesgo ${risk}. 4. Preparar un cambio mínimo aislado. 5. Ejecutar ${checks} verificaciones independientes, incluida prueba antes/después. 6. Desplegar dentro de ${hours} horas con observabilidad. 7. Revertir automáticamente si falla un criterio. 8. Guardar evidencias, hashes y decisión final.`;
  addSft({id:`stage6-plan-${String(i+1).padStart(3,'0')}`,capability:'planning',user,assistant,verification:{type:'rubric',criteria:['incluye estado inicial',`incluye equipo de ${team}`,`incluye riesgo ${risk}`,'incluye prueba antes/después','incluye rollback','incluye evidencia final',`incluye ${checks} verificaciones`]},family:`${context}:${environment}:${risk}`,index:i});
}

const causalContexts=['la latencia subió tras un despliegue','la tasa de error bajó después de cambiar caché','un modelo mejoró tras ampliar datos','una batería dura menos tras una actualización','las ventas cambiaron después de una promoción','un test falla sólo en CI','un usuario abandona un flujo nuevo','el consumo de memoria crece con el tiempo'];
for(let i=0;i<80;i++){
  const context=causalContexts[i%causalContexts.length],confounder=['carga','estacionalidad','hardware','selección de muestra'][i%4],sample=60+i*37,delta=2+(i*7)%31,window=1+i%14;
  const user=`Caso C${i+1}: ${context}; cambio observado ${delta}%, muestra ${sample}, ventana ${window} días. El posible confusor es ${confounder}. Analiza causalmente.`;
  const assistant=`Caso C${i+1}. Hecho observado: cambio de ${delta}% en una muestra de ${sample} durante ${window} días. Hipótesis causal: el cambio pudo contribuir, pero la correlación no basta. Confusor prioritario: ${confounder}. Prueba: comparar control y tratamiento bajo la misma ventana y carga, medir antes/después, registrar variables intermedias y repetir. Aceptar causalidad sólo si el efecto persiste al controlar ${confounder}, aparece en una réplica y existe un mecanismo compatible.`;
  addSft({id:`stage6-causal-${String(i+1).padStart(3,'0')}`,capability:'causal-reasoning',user,assistant,verification:{type:'rubric',criteria:['separa observación de causalidad',`usa muestra ${sample}`,`identifica ${confounder}`,'propone control','exige repetición','menciona mecanismo']},family:`${context}:${confounder}`,index:i});
}

for(let i=0;i<80;i++){
  const evidence=1+i%8,conflicts=i%3,sample=25+i*11,independent=40+(i*7)%61;
  const user=`Caso K${i+1}: hay ${evidence} observaciones, ${conflicts} resultados contradictorios, muestra ${sample} e independencia estimada ${independent}%. ¿Con qué confianza debe promoverse?`;
  const chosen=`Caso K${i+1}. Confianza provisional: ${evidence>=6&&conflicts===0&&independent>=70?'media-alta':evidence>=4&&conflicts<=1?'media':'baja'}. La muestra es ${sample} y la independencia estimada ${independent}%, por lo que no basta el promedio. Se requiere conjunto oculto, intervalos de confianza, revisión de los ${conflicts} contradictorios y réplica independiente. Promover sólo si el límite inferior supera el umbral y no hay regresiones severas.`;
  const rejected=`Caso K${i+1}: promuévelo porque la tendencia general parece favorable.`;
  if(i<40)addSft({id:`stage6-calibration-${String(i+1).padStart(3,'0')}`,capability:'calibration',user,assistant:chosen,verification:{type:'rubric',criteria:['expresa confianza',`considera muestra ${sample}`,`considera independencia ${independent}`,'considera contradicciones','exige conjunto oculto','exige réplica','evita promoción prematura']},family:`e${evidence}-c${conflicts}-i${independent}`,index:i});
  else addPreference({id:`stage6-calibration-pref-${String(i+1).padStart(3,'0')}`,capability:'calibration',user,chosen,rejected,criteria:['rechaza promoción prematura','expresa incertidumbre','exige réplica','considera regresiones'],family:`e${evidence}-c${conflicts}-i${independent}`,index:i});
}

const verificationClaims=['el build terminó correctamente','el modelo nuevo supera al campeón','el endpoint sirve el modelo solicitado','la migración no perdió datos','la PWA actualizó su service worker','el adaptador puede reanudarse','el benchmark no está contaminado','el costo mensual bajó'];
for(let i=0;i<80;i++){
  const claim=verificationClaims[i%verificationClaims.length],artifact=`artifact-${1000+i}`,checks=2+i%5;
  const user=`Caso V${i+1}: se afirma que ${claim} usando ${artifact}. Define la evidencia mínima con ${checks} comprobaciones.`;
  const chosen=`Caso V${i+1}, ${artifact}. No basta con la afirmación. Evidencia mínima: estado inicial, procedimiento reproducible, salida completa, SHA del artefacto, ${checks} comprobaciones independientes incluida una negativa o antes/después, revisión de regresiones y criterio explícito de rollback. La conclusión debe citar cada evidencia y marcar lo no verificado.`;
  const rejected=`Caso V${i+1}: si ${artifact} no muestra errores visibles, puede aceptarse.`;
  if(i<40)addSft({id:`stage6-verify-${String(i+1).padStart(3,'0')}`,capability:'verification',user,assistant:chosen,verification:{type:'rubric',criteria:['exige evidencia reproducible',`menciona ${artifact}`,`exige ${checks} comprobaciones`,'incluye prueba negativa o antes/después','incluye regresiones','incluye rollback']},family:`${claim}:${checks}`,index:i});
  else addPreference({id:`stage6-verify-pref-${String(i+1).padStart(3,'0')}`,capability:'verification',user,chosen,rejected,criteria:['rechaza apariencia como evidencia','exige identificador','exige reproducibilidad','incluye rollback'],family:`${claim}:${checks}`,index:i});
}

function readHiddenPrompts(){const set=new Set();for(const path of hiddenCandidates){if(!existsSync(path))continue;for(const line of readFileSync(path,'utf8').split(/\n+/).filter(Boolean)){const row=JSON.parse(line),prompt=row.prompt||row.messages?.find(message=>message.role==='user')?.content||'';if(prompt)set.add(normalize(prompt));}}return set;}

function validate(){
  if(sft.length!==560||preference.length!==80)throw new Error(`unexpected counts sft=${sft.length} preference=${preference.length}`);
  const all=[...sft,...preference],ids=new Set(),prompts=new Set(),semantic=new Set(),answers=new Set(),hidden=readHiddenPrompts();
  for(const row of all){
    const prompt=row.format==='chat-sft'?row.messages.find(message=>message.role==='user').content:row.prompt.find(message=>message.role==='user').content;
    const answer=row.format==='chat-sft'?row.messages.find(message=>message.role==='assistant').content:row.chosen;
    const np=normalize(prompt),na=normalize(answer);
    if(ids.has(row.id)||prompts.has(np)||semantic.has(row.semantic_key))throw new Error(`duplicate ${row.id}`);
    if(answers.has(na))throw new Error(`duplicate answer ${row.id}`);
    if(hidden.has(np))throw new Error(`benchmark contamination ${row.id}`);
    if(row.provenance.license!=='CC0-1.0'||row.provenance.containsPrivateUserData!==false||row.benchmark_excluded!==true||row.verification.verified!==true)throw new Error(`metadata failure ${row.id}`);
    ids.add(row.id);prompts.add(np);semantic.add(row.semantic_key);answers.add(na);
  }
  return all;
}

const all=validate();
mkdirSync(outDir,{recursive:true});
writeFileSync(sftPath,sft.map(row=>JSON.stringify(row)).join('\n')+'\n');
writeFileSync(prefPath,preference.map(row=>JSON.stringify(row)).join('\n')+'\n');
const distribution=all.reduce((acc,row)=>{acc[row.capability]=(acc[row.capability]||0)+1;return acc;},{});
const difficultyDistribution=all.reduce((acc,row)=>{acc[row.difficulty]=(acc[row.difficulty]||0)+1;return acc;},{});
const manifest={schemaVersion:1,batchId:'stage6-canonical-20260724',status:'generated-awaiting-executable-verification',targetModel:'Qwen/Qwen3.5-397B-A17B',totalExamples:all.length,sftExamples:sft.length,preferenceExamples:preference.length,multimodalExamples:0,distribution,difficultyDistribution,rejectedDuringGeneration:0,license:'CC0-1.0',containsPrivateUserData:false,benchmarkExcluded:true,files:{sft:'model/hector-asi/data/stage6/generated/canonical-sft-20260724.jsonl',preference:'model/hector-asi/data/stage6/generated/canonical-preference-20260724.jsonl'},sha256:{sft:sha(readFileSync(sftPath)),preference:sha(readFileSync(prefPath))},verification:{structural:true,exactDedup:true,semanticKeyDedup:true,benchmarkExactPromptCheck:true,pythonTests:false},note:'No se contabiliza como corpus canónico integrado hasta que verify-canonical-20260724.py pase todos los tests ejecutables.'};
mkdirSync(dirname(manifestPath),{recursive:true});writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({total:all.length,sft:sft.length,preference:preference.length,distribution,difficultyDistribution},null,2));
