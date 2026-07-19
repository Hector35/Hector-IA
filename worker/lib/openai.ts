import type { Bindings } from '../types';
export type AIUsage={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number}};
type AIResponse = { id:string; output_text?:string; output?: Array<{type:string;content?:Array<{type:string;text?:string}>}>; usage?:AIUsage; error?:{message:string} };

type Route={model:string;tier:'fast'|'balanced'|'deep';reason:string;reasoning?:'low'|'medium'|'high'};
const deepSignals=/\b(programa|programar|código|codigo|arquitectura|depura|debug|analiza a fondo|demuestra|prueba matemática|estrategia|plan completo|investiga profundamente|compara todas|diseña|optimiza|auditoría|auditoria|diagnóstico|diagnostico|razona paso|ingeniería|ingenieria)\b/i;
const fastSignals=/^(hola|gracias|ok|sí|si|no|cuánto|cuanto|qué hora|que hora|resume|traduce|corrige)\b/i;
function routeModel(env:Bindings,input:string,allowWeb:boolean):Route{
  const fast=env.OPENAI_MODEL_FAST||env.OPENAI_MODEL;
  const balanced=env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL;
  const deep=env.OPENAI_MODEL_REASONING||balanced;
  const score=(input.length>900?2:0)+(input.length>2500?2:0)+(deepSignals.test(input)?3:0)+(allowWeb&&/investiga|actual|reciente|compara|verifica/i.test(input)?1:0)+(input.split('\n').length>8?1:0);
  if(score>=4)return{model:deep,tier:'deep',reason:'solicitud compleja o técnica',reasoning:'high'};
  if(input.length<140&&fastSignals.test(input))return{model:fast,tier:'fast',reason:'consulta breve',reasoning:'low'};
  return{model:balanced,tier:'balanced',reason:'consulta general',reasoning:'medium'};
}
export async function respond(env: Bindings, input: string, previousResponseId: string|undefined, memories: string[], allowWeb=true) {
  const route=routeModel(env,input,allowWeb);
  const instructions = `Eres Héctor OS, asistente personal privado de Héctor. Responde en español, directo y analítico. Usa la memoria solo si es relevante. No inventes datos. Ajusta profundidad y extensión a la solicitud. Memoria disponible:\n${memories.map(x=>`- ${x}`).join('\n')||'- Sin memoria relevante'}`;
  const body: Record<string,unknown> = { model:route.model, instructions, input, store:true, reasoning:{effort:route.reasoning} };
  if(allowWeb)body.tools=[{type:'web_search',search_context_size:route.tier==='deep'?'medium':'low'}];
  if (previousResponseId) body.previous_response_id = previousResponseId;
  const res = await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await res.json<AIResponse>();
  if (!res.ok) throw new Error(data.error?.message || 'Error del proveedor de IA');
  const text = data.output_text || data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('') || 'No pude generar una respuesta.';
  return { id:data.id, text, usage:data.usage, searchedWeb:data.output?.some(x=>x.type==='web_search_call')||false, model:route.model, modelTier:route.tier, modelReason:route.reason };
}
export async function inspectImage(env:Bindings,prompt:string,dataUrl:string){const model=env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL;const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,instructions:'Analiza la imagen para Héctor. Responde en español, directo, preciso y útil. Distingue claramente observaciones de inferencias.',input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:dataUrl,detail:'auto'}]}],store:false})});const data=await res.json<AIResponse>();if(!res.ok)throw new Error(data.error?.message||'Error al analizar la imagen');const text=data.output_text||data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'No pude analizar la imagen.';return{text,usage:data.usage,model}}
export function estimateCost(usage?:AIUsage){const input=usage?.input_tokens||0,cached=usage?.input_tokens_details?.cached_tokens||0,output=usage?.output_tokens||0;return{input,cached,output,costUsd:((input-cached)*.75+cached*.075+output*4.5)/1_000_000}}