import type { Bindings } from '../types';
type AIResponse = { id:string; output_text?:string; output?: Array<{type:string;content?:Array<{type:string;text?:string}>}>; error?:{message:string} };
export async function respond(env: Bindings, input: string, previousResponseId: string|undefined, memories: string[]) {
  const instructions = `Eres Héctor OS, asistente personal privado de Héctor. Responde en español, directo y analítico. Usa la memoria solo si es relevante. No inventes datos. Memoria disponible:\n${memories.map(x=>`- ${x}`).join('\n')||'- Sin memoria relevante'}`;
  const body: Record<string,unknown> = { model:env.OPENAI_MODEL, instructions, input, store:true };
  if (previousResponseId) body.previous_response_id = previousResponseId;
  const res = await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await res.json<AIResponse>();
  if (!res.ok) throw new Error(data.error?.message || 'Error del proveedor de IA');
  const text = data.output_text || data.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('') || 'No pude generar una respuesta.';
  return { id:data.id, text };
}
