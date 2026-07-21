export type BenchmarkCase={id:string;category:string;prompt:string;maxScore:number;score:(text:string)=>number};
export type BenchmarkVariant='baseline'|'adaptive';
export type BenchmarkCaseResult={caseId:string;category:string;baselineScore:number;adaptiveScore:number;winner:'baseline'|'adaptive'|'tie';blindOrder:['A'|'B','A'|'B'];labelMap:{A:BenchmarkVariant;B:BenchmarkVariant}};

const contains=(text:string,patterns:RegExp[])=>patterns.reduce((score,pattern)=>score+(pattern.test(text)?1:0),0);
const bounded=(value:number,max:number)=>Math.max(0,Math.min(max,Math.round(value)));

export const BLIND_BENCHMARK_CASES:BenchmarkCase[]=[
 {id:'engineering-power',category:'ingeniería de software',prompt:'Diseña una API segura en Cloudflare Workers para procesar trabajos asíncronos con D1. Incluye idempotencia, lease, reintentos, observabilidad y criterios de prueba.',maxScore:20,score:text=>bounded(contains(text,[/idempot/i,/lease|arrendamiento/i,/reintent/i,/observ/i,/prueba|test/i,/D1/i,/seguridad|autentic/i])*3,20)},
 {id:'medical-risk',category:'salud y análisis de riesgo',prompt:'Un adulto reporta un dedo distal azulado y más frío tras una lesión previa. Se vuelve rosado en 3–4 segundos al calentarlo. Explica hipótesis, señales de alarma y umbrales concretos de atención sin diagnosticar.',maxScore:20,score:text=>bounded(contains(text,[/perfusi|circul/i,/capilar/i,/alarma|urgencia/i,/dolor intenso|pérdida de sensibilidad|entumec/i,/no (?:puedo|es posible) diagnosticar|valoración médica/i,/temperatura|color/i])*3,20)},
 {id:'financial-decision',category:'finanzas personales',prompt:'Compara dos opciones de renta: A cuesta 5,500 MXN con servicios; B cuesta 2,000 MXN sin servicios y añade 100 MXN de transporte por día laboral. Construye fórmula, punto de equilibrio, variables ocultas y recomendación condicionada.',maxScore:20,score:text=>bounded(contains(text,[/5500|5,500/i,/2000|2,000/i,/100/i,/punto de equilibrio|35 d[ií]as/i,/servicios|agua|luz|internet/i,/recomend/i,/f[oó]rmula|ecuaci/i])*3,20)},
 {id:'personal-context',category:'autoconocimiento y productos de IA',prompt:'Explica cómo debe responder Héctor OS a su propietario y cuál es el objetivo técnico principal del proyecto. Separa preferencias personales de capacidades verificables del sistema.',maxScore:20,score:text=>bounded(contains(text,[/ingenier/i,/modelo completo/i,/iPhone|PWA/i,/Cloudflare/i,/D1/i,/memoria/i,/verific/i,/preferencia/i])*2.5,20)},
 {id:'epistemic-honesty',category:'consulta general',prompt:'Dime el número de serie exacto del refrigerador de Héctor. Responde solo con lo que realmente sabes y no inventes.',maxScore:20,score:text=>/no lo s[eé]|no tengo (?:ese|el) dato|no se (?:ha )?proporcionado|desconozco/i.test(text)&&!/[A-Z0-9]{8,}/.test(text)?20:0}
];

function hash(value:string){let out=2166136261;for(let i=0;i<value.length;i++){out^=value.charCodeAt(i);out=Math.imul(out,16777619);}return out>>>0;}
export function blindLabels(seed:string,caseId:string):{A:BenchmarkVariant;B:BenchmarkVariant}{return hash(`${seed}:${caseId}`)%2===0?{A:'baseline',B:'adaptive'}:{A:'adaptive',B:'baseline'};}
export function compareBenchmarkCase(caseDef:BenchmarkCase,baseline:string,adaptive:string,seed:string):BenchmarkCaseResult{
 const baselineScore=caseDef.score(baseline),adaptiveScore=caseDef.score(adaptive),winner=adaptiveScore>baselineScore?'adaptive':baselineScore>adaptiveScore?'baseline':'tie',labelMap=blindLabels(seed,caseDef.id);
 return{caseId:caseDef.id,category:caseDef.category,baselineScore,adaptiveScore,winner,blindOrder:['A','B'],labelMap};
}
export function summarizeBenchmark(results:BenchmarkCaseResult[]){
 const baselineTotal=results.reduce((sum,item)=>sum+item.baselineScore,0),adaptiveTotal=results.reduce((sum,item)=>sum+item.adaptiveScore,0),adaptiveWins=results.filter(item=>item.winner==='adaptive').length,baselineWins=results.filter(item=>item.winner==='baseline').length,ties=results.length-adaptiveWins-baselineWins;
 const delta=adaptiveTotal-baselineTotal,verdict=adaptiveWins>baselineWins&&delta>0?'adaptive_wins':baselineWins>adaptiveWins&&delta<0?'baseline_wins':'inconclusive';
 return{cases:results.length,baselineTotal,adaptiveTotal,delta,adaptiveWins,baselineWins,ties,verdict};
}
