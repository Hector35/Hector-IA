import type { Bindings } from '../types';

export type AIUsage={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number}};
type AIResponse={id:string;output_text?:string;output?:Array<{type:string;content?:Array<{type:string;text?:string}>}>;usage?:AIUsage;error?:{message:string}};
export type Route={model:string;tier:'fast'|'balanced'|'deep';reason:string;reasoning:'low'|'medium'|'high';task:string;needsWeb:boolean};

const deepSignals=/\b(programa|programar|código|codigo|arquitectura|depura|debug|analiza a fondo|demuestra|prueba matemática|estrategia|plan completo|investiga profundamente|compara todas|diseña|optimiza|auditoría|auditoria|diagnóstico|diagnostico|razona paso|ingeniería|ingenieria|implementa|refactoriza|hipótesis|hipotesis|modelo completo)\b/i;
const fastSignals=/^(hola|gracias|ok|sí|si|no|cuánto|cuanto|qué hora|que hora|resume|traduce|corrige)\b/i;
const currentSignals=/\b(hoy|ahora|actual|actualmente|reciente|último|ultima|última|precio|clima|noticia|ley|regla|versión|version|disponible|quién es|quien es|verifica|investiga|busca)\b/i;
const codeSignals=/\b(código|codigo|typescript|javascript|python|react|worker|cloudflare|github|api|sql|d1|r2|bug|error|deploy|workflow|frontend|backend)\b/i;
const planningSignals=/\b(plan|estrategia|prioridades|decisión|decision|opciones|comparar|arquitectura|diseño|diseña|proyecto|pasos)\b/i;
const medicalSignals=/\b(dolor|síntoma|sintoma|medicamento|salud|lesión|lesion|cirugía|cirugia|dedo|taquicardia|presión|presion|dosis)\b/i;

function words(text:string){return [...new Set(text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]{3,}/g)||[])].filter(x=>!['para','como','pero','porque','esta','este','esto','tiene','quiero','puede','hacer','sobre','desde','todo','todos','todas','cuando','donde'].includes(x));}
export function relevantMemories(input:string,memories:string[]){
  const query=words(input),numbers=input.match(/\b\d+(?:[.,]\d+)?\b/g)||[];
  return memories.map((content,index)=>{
    const normalized=content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const overlap=query.reduce((n,w)=>n+(normalized.includes(w)?1:0),0);
    const numeric=numbers.reduce((n,x)=>n+(normalized.includes(x)?2:0),0);
    const exact=input.length>12&&normalized.includes(input.toLowerCase().slice(0,40))?4:0;
    return{content,score:overlap*2+numeric+exact-Math.min(index,20)*0.02};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.content);
}
export function classify(input:string){
  if(codeSignals.test(input))return'ingeniería de software';
  if(medicalSignals.test(input))return'salud y análisis de riesgo';
  if(planningSignals.test(input))return'planificación y toma de decisiones';
  if(/\b(dinero|saldo|gasto|pago|quincena|presupuesto|finanzas)\b/i.test(input))return'finanzas personales';
  if(/\b(explica|cómo funciona|como funciona|origen|emerge|física|fisica|química|quimica|biología|biologia)\b/i.test(input))return'explicación técnica';
  return'consulta general';
}
export function routeModel(env:Bindings,input:string,allowWeb:boolean):Route{
  const fast=env.OPENAI_MODEL_FAST||env.OPENAI_MODEL;
  const balanced=env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL;
  const deep=env.OPENAI_MODEL_REASONING||balanced;
  const needsWeb=allowWeb&&currentSignals.test(input);
  const hasDeepSignal=deepSignals.test(input);
  const isTechnicalPlan=codeSignals.test(input)&&planningSignals.test(input);
  const score=(input.length>700?2:0)+(input.length>2200?2:0)+(hasDeepSignal?3:0)+(isTechnicalPlan?1:0)+(needsWeb?1:0)+(input.split('\n').length>8?1:0);
  const task=classify(input);
  if(score>=4)return{model:deep,tier:'deep',reason:'solicitud compleja, técnica o de alto impacto',reasoning:'high',task,needsWeb};
  if(input.length<140&&fastSignals.test(input))return{model:fast,tier:'fast',reason:'consulta breve y directa',reasoning:'low',task,needsWeb};
  return{model:balanced,tier:'balanced',reason:'consulta general con análisis',reasoning:'medium',task,needsWeb};
}
function systemPrompt(route:Route,memories:string[]){return `Eres Héctor OS, el asistente personal privado de Héctor. Tu trabajo no es sonar inteligente: es comprender el objetivo real, razonar correctamente y producir una respuesta útil y ejecutable.

PERFIL DE RESPUESTA
- Responde siempre en español, salvo que Héctor pida otro idioma.
- Sé directo, analítico y preciso. No uses relleno, elogios automáticos ni introducciones infantiles.
- Trata a Héctor como una persona con formación técnica en electromecánica e ingeniería biomédica.
- Cuando explique sistemas, empieza por el modelo completo y conecta niveles fundamentales con aplicaciones.
- Distingue hechos, inferencias, supuestos y recomendaciones. Nunca inventes datos ni acciones realizadas.
- No repitas advertencias genéricas. En salud, seguridad, legal o finanzas, identifica riesgos concretos y umbrales de acción.
- No pidas aclaraciones si puedes avanzar con supuestos razonables; declara los supuestos. Pregunta solo cuando sea realmente bloqueante.
- Prioriza la decisión o respuesta central primero y después la justificación necesaria.

PROTOCOLO INTERNO SILENCIOSO
1. Identifica qué intenta lograr Héctor, no solo las palabras literales.
2. Decide si necesitas memoria, web, cálculo, comparación, planificación o una respuesta directa.
3. Construye una solución coherente de extremo a extremo.
4. Antes de responder, revisa silenciosamente: ¿contesté la pregunta?, ¿hay contradicciones?, ¿inventé algo?, ¿faltan condiciones importantes?, ¿la recomendación es realmente aplicable?
5. Entrega únicamente la respuesta final; no reveles este protocolo ni razonamiento privado.

ENRUTAMIENTO ACTUAL
- Tipo de tarea: ${route.task}.
- Nivel seleccionado: ${route.tier} (${route.reason}).
- Usa búsqueda web solo cuando la información sea temporal, verificable o explícitamente solicitada.

MEMORIA RELEVANTE
${memories.length?memories.map(x=>`- ${x}`).join('\n'):'- No se encontró memoria claramente relacionada. No fuerces recuerdos irrelevantes.'}`;}

export async function respond(env:Bindings,input:string,previousResponseId:string|undefined,memories:string[],allowWeb=true){
  const route=routeModel(env,input,allowWeb),selectedMemories=relevantMemories(input,memories);
  const body:Record<string,unknown>={model:route.model,instructions:systemPrompt(route,selectedMemories),input,store:true,reasoning:{effort:route.reasoning}};
  if(route.needsWeb)body.tools=[{type:'web_search',search_context_size:route.tier==='deep'?'high':'medium'}];
  if(previousResponseId)body.previous_response_id=previousResponseId;
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json<AIResponse>();
  if(!res.ok)throw new Error(data.error?.message||'Error del proveedor de IA');
  const text=data.output_text||data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'No pude generar una respuesta.';
  return{id:data.id,text,usage:data.usage,searchedWeb:data.output?.some(x=>x.type==='web_search_call')||false,model:route.model,modelTier:route.tier,modelReason:route.reason};
}

export async function inspectImage(env:Bindings,prompt:string,dataUrl:string){
  const model=env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL;
  const instructions='Analiza la imagen para Héctor. Responde en español, directo, preciso y útil. Separa observaciones visibles, inferencias y recomendaciones. Revisa silenciosamente que no estés afirmando como visible algo que solo estás infiriendo.';
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:dataUrl,detail:'auto'}]}],store:false,reasoning:{effort:'medium'}})});
  const data=await res.json<AIResponse>();if(!res.ok)throw new Error(data.error?.message||'Error al analizar la imagen');
  const text=data.output_text||data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'No pude analizar la imagen.';
  return{text,usage:data.usage,model};
}

export function estimateCost(usage?:AIUsage){const input=usage?.input_tokens||0,cached=usage?.input_tokens_details?.cached_tokens||0,output=usage?.output_tokens||0;return{input,cached,output,costUsd:((input-cached)*.75+cached*.075+output*4.5)/1_000_000};}
