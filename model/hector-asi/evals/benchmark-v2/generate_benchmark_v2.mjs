import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';

const OUT=process.argv[2]||'model/hector-asi/evals/benchmark-v2/hidden.jsonl';
const SEED='hector-stage6-benchmark-v2-20260724';
const categories=['mathematics','code','planning','tools','causality','calibration','metacognition','comprehension','multimodal','transfer'];
const difficulties=['medium','hard','adversarial','transfer'];
const sha=value=>createHash('sha256').update(value).digest('hex');

function caseFor(category,index){
 const n=index+1,a=17+n*3,b=11+n*5,c=7+(n%19);
 const common={id:`b2-${category}-${String(n).padStart(3,'0')}`,category,difficulty:difficulties[index%difficulties.length],split:'hidden',seed:SEED,benchmark_excluded_from_training:true,scoring:{max_points:4,pass_points:3},provenance:{kind:'deterministic-generated',license:'CC0-1.0',generator_revision:1}};
 if(category==='mathematics')return{...common,prompt:`Calcula exactamente (${a}×${b})-${c}². Da resultado y una verificación independiente.`,reference:{answer:a*b-c*c},verifier:{type:'numeric_exact',expected:a*b-c*c,requires_independent_check:true}};
 if(category==='code')return{...common,prompt:`Escribe una función Python solve_${n}(xs) que devuelva los valores únicos de xs ordenados por (frecuencia descendente, valor ascendente). Incluye complejidad.`,reference:{language:'python',function:`solve_${n}`},verifier:{type:'python_tests',tests:[[ [3,1,3,2,1,3],[3,1,2] ],[[2,2,1,1],[1,2]],[[],[]]],complexity_max:'O(n log n)'}};
 if(category==='planning')return{...common,prompt:`Planifica ${4+n%5} tareas con duraciones ${[2+n%3,3+n%4,1+n%2,4+n%3].join(',')} y dos recursos. Las tareas 2 y 3 dependen de la 1; la 4 depende de ambas. Minimiza makespan y explica cómo verificarlo.`,reference:{constraints:['precedence','two_resources','makespan']},verifier:{type:'structured_plan',required_fields:['schedule','resource_assignment','makespan','verification'],constraint_check:true}};
 if(category==='tools')return{...common,prompt:`Debes responder una pregunta cuyo dato puede haber cambiado hoy. Diseña una secuencia de herramientas que verifique fecha, fuente primaria y fallback sin atribuir al modelo un resultado de otra ruta.`,reference:{required:['freshness_check','primary_source','effective_model','fallback_disclosure']},verifier:{type:'rubric',criteria:['freshness','source_quality','model_attribution','fallback_honesty']}};
 if(category==='causality')return{...common,prompt:`En un estudio, X correlaciona con Y; Z causa X y también Y. Explica qué puede concluirse, qué intervención identificaría el efecto de X y un control negativo. Caso ${n}.`,reference:{graph:['Z->X','Z->Y','X?->Y']},verifier:{type:'causal_rubric',criteria:['confounding','intervention','control_negative','limits']}};
 if(category==='calibration')return{...common,prompt:`Tienes evidencia parcial con dos fuentes concordantes y una fuente antigua contradictoria. Da conclusión, probabilidad numérica, intervalo razonable y qué evidencia cambiaría tu respuesta. Caso ${n}.`,reference:{required:['probability','uncertainty_interval','update_condition']},verifier:{type:'calibration_rubric',brier_track:true,forbid_false_certainty:true}};
 if(category==='metacognition')return{...common,prompt:`Resuelve una tarea compleja y después audita tu propia respuesta: separa hechos, inferencias, supuestos, puntos no verificados y el fallo más probable. Escenario ${n}.`,reference:{required_sections:['facts','inferences','assumptions','unverified','likely_failure']},verifier:{type:'section_rubric',all_required:true}};
 if(category==='comprehension')return{...common,prompt:`Lee: “El sistema aprobó 8 de 10 pruebas, pero dos pruebas críticas no se ejecutaron; el informe dice ‘sin fallos observados’”. Explica la diferencia entre ausencia de fallo y evidencia de éxito, y redacta una conclusión correcta. Variante ${n}.`,reference:{concepts:['missingness','coverage','qualified_claim']},verifier:{type:'semantic_rubric',criteria:['distinction','coverage','corrected_claim']}};
 if(category==='multimodal')return{...common,prompt:`Caso visual ${n}: se entrega una imagen con tres barras etiquetadas A=${a}, B=${b}, C=${c}. Extrae valores, identifica la mayor y calcula A−C. Si la imagen no está disponible, debes declararlo sin inventar.`,reference:{values:{A:a,B:b,C:c},largest:['A','B','C'].sort((x,y)=>({A:a,B:b,C:c}[y]-({A:a,B:b,C:c}[x]))[0],difference:a-c},verifier:{type:'multimodal_grounded',requires_asset:true,forbid_answer_without_asset:true}};
 return{...common,prompt:`Aplica una regla aprendida fuera de plantilla: una política acepta elementos con puntuación prima y rechaza compuestos, salvo múltiplos de ${c}. Clasifica ${a}, ${b}, ${c*3} y explica excepciones.`,reference:{rule:'prime_or_exception'},verifier:{type:'rule_execution',inputs:[a,b,c*3],exception_multiple:c}};
}

const cases=[];
for(const category of categories)for(let i=0;i<50;i++)cases.push(caseFor(category,i));
for(const item of cases)item.content_sha256=sha(JSON.stringify({...item,content_sha256:undefined}));
mkdirSync(dirname(OUT),{recursive:true});
writeFileSync(OUT,cases.map(x=>JSON.stringify(x)).join('\n')+'\n');
const manifest={schemaVersion:2,name:'Hector Benchmark V2',status:'generated-unvalidated',seed:SEED,total:cases.length,hidden:cases.length,categories:Object.fromEntries(categories.map(c=>[c,cases.filter(x=>x.category===c).length])),sha256:sha(cases.map(x=>JSON.stringify(x)).join('\n')+'\n'),trainingGate:{minimumHidden:500,minimumV41Failures:100,maximumV41Score:0.85,open:false},modelResults:{v15:null,v41:null,qwen3_8b:null,qwen3_5_397b:null,kimi_k2_5:null},attributionRule:'A result is valid only when the effective model identifier and endpoint response are recorded; fallback results are never attributed to the requested model.'};
writeFileSync(OUT.replace(/hidden\.jsonl$/,'manifest.generated.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
