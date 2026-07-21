import type {Bindings} from '../types';
import {BOOTSTRAP_VERSION,renderBootstrap} from '../intelligence/bootstrap';
import {callCloudflare,chooseProvider,type ProviderName} from './providers';
import {assessProviderResponse,loadCloudflareHealth,recordProviderQuality,type ProviderQualityAssessment} from './provider-quality';

export const CONTEXTUAL_ENGINE_VERSION='3.0.0';
export type AIUsage={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number}};
type AIResponse={id:string;output_text?:string;output?:Array<{type:string;content?:Array<{type:string;text?:string}>}>;usage?:AIUsage;error?:{message:string}};
export type ReasoningEffort='low'|'medium'|'high'|'xhigh'|'max';
export type Route={model:string;tier:'fast'|'balanced'|'deep';reason:string;reasoning:ReasoningEffort;task:string;needsWeb:boolean};
export type ChatTurn={role:'user'|'assistant';content:string};
export type ResponseOptions={reasoning?:'auto'|'high'|'max'};

const deepSignals=/\b(programa|programar|código|codigo|arquitectura|depura|debug|analiza a fondo|demuestra|prueba matemática|estrategia|plan completo|investiga profundamente|compara todas|diseña|optimiza|audita|auditoría|auditoria|diagnóstico|diagnostico|razona paso|ingeniería|ingenieria|implementa|refactoriza|refactorización|refactorizacion|hipótesis|hipotesis|modelo completo|autoevalúa|autoevalua|autoconocimiento|inteligencia máxima|inteligencia maxima)\b/i;
const fastSignals=/^(hola|gracias|ok|sí|si|no|cuánto|cuanto|qué hora|que hora|resume|traduce|corrige)\b/i;
const currentSignals=/\b(hoy|ahora|actual|actualmente|reciente|último|ultima|última|precio|clima|noticia|ley|regla|versión|version|disponible|quién es|quien es|verifica|investiga|busca)\b/i;
const codeSignals=/\b(código|codigo|typescript|javascript|python|react|worker|cloudflare|github|api|sql|d1|r2|bug|error|deploy|workflow|frontend|backend|codex)\b/i;
const planningSignals=/\b(plan|estrategia|prioridades|decisión|decision|opciones|comparar|compara|arquitectura|diseño|diseña|proyecto|pasos|riesgos|migración|migracion)\b/i;
const medicalSignals=/\b(dolor|síntoma|sintoma|medicamento|salud|lesión|lesion|cirugía|cirugia|dedo|taquicardia|presión|presion|dosis)\b/i;
const selfKnowledgeSignals=/(?:hector os|héctor os|quién eres|quien eres|sobre ti|tu arquitectura|tus capacidades|qué puedes hacer|que puedes hacer|tus limitaciones|sobre mí|sobre mi|mi perfil|openai|chatgpt work|(?:^|\s)work(?:\s|$)|codex|gpt[-‑ ]?5\.6)/i;
const productFreshnessSignals=/\b(actual|actualmente|hoy|disponible|disponibilidad|precio|plan|límite|limite|versión|version|modelo|función|funcion|novedad|último|ultima|última)\b/i;

function normalize(text:string){return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function words(text:string){return [...new Set(normalize(text).match(/[a-z0-9]{3,}/g)||[])].filter(x=>!['para','como','pero','porque','esta','este','esto','tiene','quiero','puede','hacer','sobre','desde','todo','todos','todas','cuando','donde'].includes(x));}
export function relevantMemories(input:string,memories:string[]){
 const normalizedInput=normalize(input),query=words(input),numbers=input.match(/\b\d+(?:[.,]\d+)?\b/g)||[];
 return memories.map((content,index)=>{const normalized=normalize(content),overlap=query.reduce((n,w)=>n+(normalized.includes(w)?1:0),0),numeric=numbers.reduce((n,x)=>n+(normalized.includes(x)?2:0),0),exact=normalizedInput.length>12&&normalized.includes(normalizedInput.slice(0,40))?4:0;return{content,score:overlap*2+numeric+exact-Math.min(index,20)*0.02};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.content);
}
export function classify(input:string){
 if(selfKnowledgeSignals.test(input))return'autoconocimiento y productos de IA';
 if(codeSignals.test(input))return'ingeniería de software';
 if(medicalSignals.test(input))return'salud y análisis de riesgo';
 if(planningSignals.test(input))return'planificación y toma de decisiones';
 if(/\b(dinero|saldo|gasto|pago|quincena|presupuesto|finanzas)\b/i.test(input))return'finanzas personales';
 if(/\b(explica|cómo funciona|como funciona|origen|emerge|física|fisica|química|quimica|biología|biologia)\b/i.test(input))return'explicación técnica';
 return'consulta general';
}
export function routeModel(env:Bindings,input:string,allowWeb:boolean):Route{
 const fast=env.OPENAI_MODEL_FAST||env.OPENAI_MODEL,balanced=env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,deep=env.OPENAI_MODEL_REASONING||balanced;
 const selfKnowledge=selfKnowledgeSignals.test(input),productCurrent=selfKnowledge&&productFreshnessSignals.test(input),needsWeb=allowWeb&&(currentSignals.test(input)||productCurrent);
 const hasDeepSignal=deepSignals.test(input),hasPlanningSignal=planningSignals.test(input),isTechnicalPlan=codeSignals.test(input)&&hasPlanningSignal,isComplexPlan=hasDeepSignal&&hasPlanningSignal;
 const score=(input.length>700?2:0)+(input.length>2200?2:0)+(hasDeepSignal?3:0)+(isTechnicalPlan?1:0)+(isComplexPlan?1:0)+(needsWeb?1:0)+(input.split('\n').length>8?1:0),task=classify(input);
 if(selfKnowledge)return{model:deep,tier:'deep',reason:'autoconocimiento, perfil del propietario o producto de IA requiere máxima precisión',reasoning:'xhigh',task,needsWeb};
 if(score>=4)return{model:deep,tier:'deep',reason:'solicitud compleja, técnica o de alto impacto',reasoning:'xhigh',task,needsWeb};
 if(input.length<140&&fastSignals.test(input))return{model:fast,tier:'fast',reason:'consulta breve y directa',reasoning:'low',task,needsWeb};
 return{model:balanced,tier:'balanced',reason:'consulta general con análisis',reasoning:'medium',task,needsWeb};
}
export function applyResponseOptions(env:Bindings,route:Route,options:ResponseOptions={}):Route{
 if(!options.reasoning||options.reasoning==='auto')return route;
 return{...route,model:env.OPENAI_MODEL_REASONING||route.model,tier:'deep',reasoning:'max',reason:`razonamiento ${options.reasoning==='max'?'máximo':'alto'} solicitado explícitamente; GPT-5.6 Sol con esfuerzo max`};
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
- Para OpenAI, Work, Codex y GPT‑5.6 distingue conocimiento estable de información actual; verifica esta última únicamente con fuentes oficiales de OpenAI cuando la web esté permitida.
- Nunca afirmes qué modelo respondió basándote solo en el nombre solicitado; usa el identificador efectivo o la configuración observable.
- Distingue siempre Héctor OS, OpenAI como proveedor, GPT-5.6 como familia de modelos y Work/Codex como superficies externas.
- Antes de responder revisa silenciosamente: objetivo, consistencia, evidencia, omisiones y aplicabilidad.
- No reveles razonamiento privado; entrega solo la respuesta final.

ENRUTAMIENTO
- Tarea: ${route.task}
- Nivel: ${route.tier}
- Esfuerzo: ${route.reasoning}
- Modelo: ${route.model}
- Motivo: ${route.reason}
- Bootstrap: ${BOOTSTRAP_VERSION}`;}
function legacyPrompt(route:Route,memories:string[]){return `${renderBootstrap()}\n\n${behaviorRules(route)}\n\nMEMORIA RELEVANTE\n${memories.length?memories.map(x=>`- ${x}`).join('\n'):'- Sin memoria relevante'}`;}
async function callResponses(env:Bindings,body:Record<string,unknown>){const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json<AIResponse>();if(!res.ok)throw new Error(data.error?.message||'Error del proveedor de IA');const text=data.output_text||data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'No pude generar una respuesta.';return{data,text,searchedWeb:data.output?.some(x=>x.type==='web_search_call')||false};}
async function saveQuality(env:Bindings,route:Route,started:number,requestedProvider:ProviderName,actualProvider:ProviderName,model:string,fallback:boolean,assessment:ProviderQualityAssessment,reasons:string[]=[]){await recordProviderQuality(env.DB,{requestedProvider,actualProvider,model,routeTier:route.tier,task:route.task,accepted:assessment.accepted,score:assessment.score,fallback,latencyMs:Date.now()-started,reasons:[...reasons,...assessment.reasons]});}
async function openAIFallback(env:Bindings,input:string,instructions:string,route:Route,openAIInput:unknown,started:number,reason:string){const body:Record<string,unknown>={model:route.model,instructions,input:openAIInput,store:true,reasoning:{effort:route.reasoning}};try{const out=await callResponses(env,body),assessment=assessProviderResponse(input,out.text);await saveQuality(env,route,started,'cloudflare','openai',route.model,true,assessment,[reason]);return{id:out.data.id,text:out.text,usage:out.data.usage,searchedWeb:false,model:route.model,provider:'openai' as ProviderName,requestedProvider:'cloudflare' as ProviderName,providerReason:reason,fallback:true,qualityScore:assessment.score,qualityAccepted:assessment.accepted};}catch(error){const message=error instanceof Error?error.message:'OpenAI también falló';await saveQuality(env,route,started,'cloudflare','openai',route.model,true,{accepted:false,score:0,reasons:[message]},[reason]);throw error;}}
async function executeHybrid(env:Bindings,input:string,instructions:string,route:Route,openAIInput:unknown){const started=Date.now(),enabled=env.CLOUDFLARE_AI_ENABLED!=='false',health=route.tier==='fast'&&enabled?await loadCloudflareHealth(env.DB):undefined,decision=chooseProvider(input,route.tier,route.needsWeb,enabled,health);if(decision.provider==='cloudflare'){try{const cf=await callCloudflare(env,instructions,input),assessment=assessProviderResponse(input,cf.text);if(!assessment.accepted)return openAIFallback(env,input,instructions,route,openAIInput,started,`Fallback de calidad: ${assessment.reasons.join(', ')||`puntaje ${assessment.score}`}`);await saveQuality(env,route,started,'cloudflare','cloudflare',cf.model,false,assessment);return{id:cf.id,text:cf.text,usage:cf.usage,searchedWeb:false,model:cf.model,provider:'cloudflare' as ProviderName,requestedProvider:'cloudflare' as ProviderName,providerReason:decision.reason,fallback:false,qualityScore:assessment.score,qualityAccepted:true};}catch(error){return openAIFallback(env,input,instructions,route,openAIInput,started,`Fallback: ${error instanceof Error?error.message:'Workers AI falló'}`);}}const body:Record<string,unknown>={model:route.model,instructions,input:openAIInput,store:true,reasoning:{effort:route.reasoning}};if(route.needsWeb)body.tools=[{type:'web_search',search_context_size:route.tier==='deep'?'high':'medium'}];const out=await callResponses(env,body),assessment=assessProviderResponse(input,out.text);await saveQuality(env,route,started,'openai','openai',route.model,false,assessment);return{id:out.data.id,text:out.text,usage:out.data.usage,searchedWeb:out.searchedWeb,model:route.model,provider:'openai' as ProviderName,requestedProvider:'openai' as ProviderName,providerReason:decision.reason,fallback:false,qualityScore:assessment.score,qualityAccepted:assessment.accepted};}
export async function respond(env:Bindings,input:string,previousResponseId:string|undefined,memories:string[],allowWeb=true,options:ResponseOptions={}){const route=applyResponseOptions(env,routeModel(env,input,allowWeb),options),selectedMemories=relevantMemories(input,memories),instructions=legacyPrompt(route,selectedMemories),result=await executeHybrid(env,input,instructions,route,input);return{...result,modelTier:route.tier,modelReason:route.reason,reasoningEffort:route.reasoning};}
export function conversationInput(history:ChatTurn[],input:string):ChatTurn[]{const trimmed=history.slice(-16).map(x=>({role:x.role,content:x.content})),last=trimmed[trimmed.length-1];return last?.role==='user'&&last.content===input?trimmed:[...trimmed,{role:'user' as const,content:input}];}
export async function respondContextual(env:Bindings,input:string,history:ChatTurn[],renderedContext:string,allowWeb=true,options:ResponseOptions={}){const route=applyResponseOptions(env,routeModel(env,input,allowWeb),options),instructions=`${renderBootstrap()}\n\n${behaviorRules(route)}\n\nCONTEXTO DINÁMICO\n${renderedContext}`,conversation=conversationInput(history,input),result=await executeHybrid(env,input,instructions,route,conversation);return{...result,modelTier:route.tier,modelReason:route.reason,reasoningEffort:route.reasoning,task:route.task};}
export async function inspectImage(env:Bindings,prompt:string,dataUrl:string){const model=env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL,instructions=`${renderBootstrap()}\n\nAnaliza la imagen para Héctor. Responde en español, directo, preciso y útil. Separa observaciones visibles, inferencias y recomendaciones. No afirmes como visible algo que solo estás infiriendo.`,out=await callResponses(env,{model,instructions,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:dataUrl,detail:'auto'}]}],store:false,reasoning:{effort:'medium'}});return{text:out.text,usage:out.data.usage,model,provider:'openai' as ProviderName};}
const pricing:Record<string,{input:number;cached:number;output:number}>={'gpt-5.6':{input:5,cached:.5,output:30},'gpt-5.6-sol':{input:5,cached:.5,output:30},'gpt-5.6-terra':{input:2.5,cached:.25,output:15},'gpt-5.6-luna':{input:1,cached:.1,output:6},'gpt-5.4':{input:2.5,cached:.25,output:15},'gpt-5.4-mini':{input:.75,cached:.075,output:4.5}};
export function estimateCost(usage?:AIUsage,model='gpt-5.6-terra'){const input=usage?.input_tokens||0,cached=usage?.input_tokens_details?.cached_tokens||0,output=usage?.output_tokens||0,p=pricing[model]||pricing['gpt-5.6-terra'];return{input,cached,output,costUsd:((input-cached)*p.input+cached*p.cached+output*p.output)/1_000_000};}
