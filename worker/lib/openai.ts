import type { Bindings } from '../types';
export type AIUsage={input_tokens?:number;output_tokens?:number;input_tokens_details?:{cached_tokens?:number}};
type AIResponse = { id:string; output_text?:string; output?: Array<{type:string;content?:Array<{type:string;text?:string}>}>; usage?:AIUsage; error?:{message:string} };
export async function respond(env: Bindings, input: string, previousResponseId: string|undefined, memories: string[], allowWeb=true) {
  const instructions = `Eres Héctor OS, asistente personal privado de Héctor. Responde en español, directo y analítico. Usa la memoria solo si es relevante. No inventes datos. Memoria disponible:\n${memories.map(x=>`- ${x}`).join('\n')||'- Sin memoria relevante'}`;
  const body: Record<string,unknown> = { model:env.OPENAI_MODEL, instructions, input, store:true };
  if(allowWeb)body.tools=[{type:'web_search',search_context_size:'low'}];
  if (previousResponseId) body.previous_response_id = previousResponseId;
  const res = await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await res.json<AIResponse>();
  if (!res.ok) throw new Error(data.error?.message || 'Error del proveedor de IA');
  const text = data.output_text || data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('') || 'No pude generar una respuesta.';
  return { id:data.id, text, usage:data.usage, searchedWeb:data.output?.some(x=>x.type==='web_search_call')||false };
}
export async function inspectImage(env:Bindings,prompt:string,dataUrl:string){const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL,instructions:'Analiza la imagen para Héctor. Responde en español, directo, preciso y útil. Distingue claramente observaciones de inferencias.',input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:dataUrl,detail:'auto'}]}],store:false})});const data=await res.json<AIResponse>();if(!res.ok)throw new Error(data.error?.message||'Error al analizar la imagen');const text=data.output_text||data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'No pude analizar la imagen.';return{text,usage:data.usage}}
export function estimateCost(usage?:AIUsage){const input=usage?.input_tokens||0,cached=usage?.input_tokens_details?.cached_tokens||0,output=usage?.output_tokens||0;return{input,cached,output,costUsd:((input-cached)*.75+cached*.075+output*4.5)/1_000_000}}
