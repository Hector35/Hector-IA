import type { Bindings } from '../types';
import { BOOTSTRAP_VERSION,renderBootstrap } from '../intelligence/bootstrap';
import {callCloudflare,chooseProvider,type ProviderName} from './providers';
import {assessProviderResponse,loadCloudflareHealth,recordProviderQuality,type ProviderQualityAssessment} from './provider-quality';

export const CONTEXTUAL_ENGINE_VERSION='2.3.0';
export type AIUsage={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number}};
type AIResponse={id:string;output_text?:string;output?:Array<{type:string;content?:Array<{type:string;text?:string}>}>;usage?:AIUsage;error?:{message:string}};
export type Route={model:string;tier:'fast'|'balanced'|'deep';reason:string;reasoning:'low'|'medium'|'high';task:string;needsWeb:boolean};
export type ChatTurn={role:'user'|'assistant';content:string};

const deepSignals=/\b(programa|programar|código|codigo|arquitectura|depura|debug|analiza a fondo|demuestra|prueba matemática|estrategia|plan completo|investiga profundamente|compara todas|diseña|optimiza|audita|auditoría|auditoria|diagnóstico|diagnostico|razona paso|ingeniería|ingenieria|implementa|refactoriza|refactorización|refactorizacion|hipótesis|hipotesis|modelo completo)\b/i;
const fastSignals=/^(hola|gracias|ok|sí|si|no|cuánto|cuanto|qué hora|que hora|resume|traduce|corrige)\b/i;
const currentSignals=/\b(hoy|ahora|actual|actualmente|reciente|último|ultima|última|precio|clima|noticia|ley|regla|versión|version|disponible|quién es|quien es|verifica|investiga|busca)\b/i;
const codeSignals=/\b(código|codigo|typescript|javascript|python|react|worker|cloudflare|github|api|sql|d1|r2|bug|error|deploy|workflow|frontend|backend)\b/i;
const planningSignals=/\b(plan|estrategia|prioridades|decisión|decision|opciones|comparar|compara|arquitectura|diseño|diseña|proyecto|pasos|riesgos|migración|migracion)\b/i;
const medicalSignals=/\b(dolor|síntoma|sintoma|medicamento|salud|lesión|lesion|cirugía|cirugia|dedo|taquicardia|presión|presion|dosis)\b/i;

function normalize(text:string){return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function words(text:string){return [...new Set(normalize(text).match(/[a-z0-9]{3,}/g)||[])].filter(x=>!['para','como','pero','porque','esta','este','esto','tiene','quiero','puede','hacer','sobre','desde','todo','todos','todas','cuando','donde'].includes(x));}
export function relevantMemories(input:string,memories:string[]){
  const normalizedInput=normalize(input),query=words(input),numbers=input.match(/\b\d+(?:[.,]\d+)?\b/g)||[];
  return memories.map((content,index)=>{
    const normalized=normalize(content);
    const overlap=query.reduce((n,w)=>n+(normalized.includes(w)?1:0),0);
    const numeric=numbers.reduce((n,x)=>n+(normalized.includes(x)?2:0),0);
    const exact=normalizedInput.length>12&&normalized.includes(normalizedInput.slice(0,40))?4:0;
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
  const hasPlanningSignal=planningSignals.test(input);
  const isTechnicalPlan=codeSignals.test(input)&&hasPlanningSignal;
  const isComplexPlan=hasDeepSignal&&hasPlanningSignal;
  const score=(input.length>700?2:0)+(input.length>2200?2:0)+(hasDeepSignal?3:0)+(isTechnicalPlan?1:0)+(isComplexPlan?1:0)+(needsWeb?1:0)+(input.split('\n').length>8?1:0);
  const task=classify(input);
  if(score>=4)return{model:deep,tier:'deep',reason:'solicitud compleja, técnica o de alto impacto',reasoning:'high',task,needsWeb};
  if(input.length<140&&fastSignals.test(input))return{model:fast,tier:'fast',reason:'consulta breve y directa',reasoning:'low',task,needsWeb};
  return{model:balanced,tier:'balanced',reason:'consulta general con análisis',reasoning:'medium',task,needsWeb};
}
function behaviorRules(route:Route){return `Tu trabajo no es sonar inteligente: es comprender el objetivo real, conservar contexto, razonar correctamente y producir una respuesta útil y ejecutable.

REGLAS DE OPERACIÓN
- Responde en español salvo petición contraria.
- Sé directo, analítico y preciso; evita relleno y elogios automáticos.
- Trata a Héctor como una persona con formación técnica. Empieza por el modelo completo cuando explique sistemas.
- Distingue hechos, inferencias, supuestos y recomendaciones. Nunca inventes datos ni acciones ejecutadas.
- Conserva continuidad con el historial y el contexto suministrados. Si hay conflicto, prioriza información reciente y explícita.
- No afirmes haber usado una herramienta, modificado código, desplegado o verificado algo sin evidencia en el contexto.
- En salud, legal, finanzas y seguridad, identifica riesgos concretos y umbrales de acción.
- En cálculos técnicos, muestra ecuaciones si ayudan, pero repite siempre los resultados finales en texto plano con número y unidad.
- Cuando evalúes tus capacidades o carencias, basa cada afirmación en componentes presentes: D1, R2, Worker, memoria, resúmenes, router, herramientas, pruebas, despliegues y rutas API.
- Antes de responder revisa silenciosamente: objetivo, consistencia, evidencia, omisiones y aplicabilidad.
- No reveles razonamiento privado; entrega solo la respuesta final.

ENRUTAMIENTO
- Tarea: ${route.task}
- Nivel: ${route.tier}
- Motivo: ${route.reason}
- Bootstrap: ${BOOTSTRAP_VERSION}`;}
function legacyPrompt(route:Route,memories:string[]){return `${renderBootstrap()}\n\n${behaviorRules(route)}\n\nMEMORIA RELEVANTE\n${memories.length?memories.map(x=>`- ${x}`).join('\n'):'- Sin memoria relevante'}`;}
async function callResponses(env:Bindings,body:Record<string,unknown>){
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json<AIResponse>();
  if(!res.ok)throw new Error(data.error?.message||'Error del proveedor de IA');
  const text=data.output_text||data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'No pude generar una respuesta.';
  return{data,text,searchedWeb:data.output?.some(x=>x.type==='web_search_call')||false};
}
async function saveQuality(env:Bindings,route:Route,started:number,requestedProvider:ProviderName,actualProvider:ProviderName,model:string,fallback:boolean,assessment:ProviderQualityAssessment,reasons:string[]=[]){
  await recordProviderQuality(env.DB,{requestedProvider,actualProvider,model,routeTier:route.tier,task:route.task,accepted:assessment.accepted,score:assessment.score,fallback,latencyMs:Date.now()-started,reasons:[...reasons,...assessment.reasons]});
}
async function openAIFallback(env:Bindings,input:string,instructions:string,route:Route,openAIInput:unknown,started:number,reason:string){
  const body:Record<string,unknown>={model:route.model,instructions,input:openAIInput,store:true,reasoning:{effort:route.reasoning}};
  try{
    const out=await callResponses(env,body),assessment=assessProviderResponse(input,out.text);
    await saveQuality(env,route,started,'cloudflare','openai',route.model,true,assessment,[reason]);
    return{id:out.data.id,text:out.text,usage:out.data.usage,searchedWeb:false,model:route.model,provider:'openai' as ProviderName,requestedProvider:'cloudflare' as ProviderName,providerReason:reason,fallback:true,qualityScore:assessment.score,qualityAccepted:assessment.accepted};
  }catch(error){
    const message=error instanceof Error?error.message:'OpenAI también falló';
    await saveQuality(env,route,started,'cloudflare','openai',route.model,true,{accepted:false,score:0,reasons:[message]},[reason]);
    throw error;
  }
}
async function executeHybrid(env:Bindings,input:string,instructions:string,route:Route,openAIInput:unknown){
  const started=Date.now(),enabled=env.CLOUDFLARE_AI_ENABLED!=='false';
  const health=route.tier==='fast'&&enabled?await loadCloudflareHealth(env.DB):undefined;
  const decision=chooseProvider(input,route.tier,route.needsWeb,enabled,health);
  if(decision.provider==='cloudflare'){
    try{
      const cf=await callCloudflare(env,instructions,input),assessment=assessProviderResponse(input,cf.text);
      if(!assessment.accepted)return openAIFallback(env,input,instructions,route,openAIInput,started,`Fallback de calidad: ${assessment.reasons.join(', ')||`puntaje ${assessment.score}`}`);
      await saveQuality(env,route,started,'cloudflare','cloudflare',cf.model,false,assessment);
      return{id:cf.id,text:cf.text,usage:cf.usage,searchedWeb:false,model:cf.model,provider:'cloudflare' as ProviderName,requestedProvider:'cloudflare' as ProviderName,providerReason:decision.reason,fallback:false,qualityScore:assessment.score,qualityAccepted:true};
    }catch(error){
      return openAIFallback(env,input,instructions,route,openAIInput,started,`Fallback: ${error instanceof Error?error.message:'Workers AI falló'}`);
    }
  }
  const body:Record<string,unknown>={model:route.model,instructions,input:openAIInput,store:true,reasoning:{effort:route.reasoning}};
  if(route.needsWeb)body.tools=[{type:'web_search',search_context_size:route.tier==='deep'?'high':'medium'}];
  const out=await callResponses(env,body),assessment=assessProviderResponse(input,out.text);
  await saveQuality(env,route,started,'openai','openai',route.model,false,assessment);
  return{id:out.data.id,text:out.text,usage:out.data.usage,searchedWeb:out.searchedWeb,model:route.model,provider:'openai' as ProviderName,requestedProvider:'openai' as ProviderName,providerReason:decision.reason,fallback:false,qualityScore:assessment.score,qualityAccepted:assessment.accepted};
}
export async function respond(env:Bindings,input:string,previousResponseId:string|undefined,memories:string[],allowWeb=true){
  const route=routeModel(env,input,allowWeb),selectedMemories=relevantMemories(input,memories),instructions=legacyPrompt(route,selectedMemories);
  const result=await executeHybrid(env,input,instructions,route,input);
  return{...result,modelTier:route.tier,modelReason:route.reason};
}
export function conversationInput(history:ChatTurn[],input:string):ChatTurn[]{
  const trimmed=history.slice(-16).map(x=>({role:x.role,content:x.content}));
  const last=trimmed[trimmed.length-1];
  return last?.role==='user'&&last.content===input?trimmed:[...trimmed,{role:'user' as const,content:input}];
}
export async function respondContextual(env:Bindings,input:string,history:ChatTurn[],renderedContext:string,allowWeb=true){
  const route=routeModel(env,input,allowWeb);
  const instructions=`${renderBootstrap()}\n\n${behaviorRules(route)}\n\nCONTEXTO DINÁMICO\n${renderedContext}`;
  const conversation=conversationInput(history,input);
  const result=await executeHybrid(env,input,instructions,route,conversation);
  return{...result,modelTier:route.tier,modelReason:route.reason,task:route.task};
}
export async function inspectImage(env:Bindings,prompt:string,dataUrl:string){
  const model=env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL;
  const instructions=`${renderBootstrap()}\n\nAnaliza la imagen para Héctor. Responde en español, directo, preciso y útil. Separa observaciones visibles, inferencias y recomendaciones. No afirmes como visible algo que solo estás infiriendo.`;
  const out=await callResponses(env,{model,instructions,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:dataUrl,detail:'auto'}]}],store:false,reasoning:{effort:'medium'}});
  return{text:out.text,usage:out.data.usage,model,provider:'openai' as ProviderName};
}
export function estimateCost(usage?:AIUsage){const input=usage?.input_tokens||0,cached=usage?.input_tokens_details?.cached_tokens||0,output=usage?.output_tokens||0;return{input,cached,output,costUsd:((input-cached)*.75+cached*.075+output*4.5)/1_000_000};}
