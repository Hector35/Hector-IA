import type { Bindings } from '../types';
import type {ProviderHealth} from './provider-quality';
import type {UserFeedbackProfile} from './response-feedback';

export type ProviderName='cloudflare'|'openai';
export type ProviderDecision={provider:ProviderName;reason:string};

const sensitiveSignals=/\b(salud|médic|medic|dolor|síntoma|sintoma|dosis|finanzas|dinero|saldo|banco|contraseña|password|token|secreto|privado|personal|legal|demanda|contrato)\b/i;
const complexSignals=/\b(código|codigo|arquitectura|debug|depura|audita|implementa|refactoriza|investiga|compara|estrategia|modelo completo|razona|demuestra|github|cloudflare|d1|r2|deploy|workflow)\b/i;

export function chooseProvider(input:string,tier:'fast'|'balanced'|'deep',needsWeb:boolean,enabled=true,health?:ProviderHealth,feedback?:UserFeedbackProfile):ProviderDecision{
  if(!enabled)return{provider:'openai',reason:'Workers AI desactivado'};
  if(needsWeb)return{provider:'openai',reason:'requiere búsqueda web integrada'};
  if(tier!=='fast')return{provider:'openai',reason:'requiere razonamiento balanceado o profundo'};
  if(sensitiveSignals.test(input))return{provider:'openai',reason:'contenido sensible o privado'};
  if(complexSignals.test(input))return{provider:'openai',reason:'tarea técnica o compleja'};
  if(feedback?.avoidCloudflare)return{provider:'openai',reason:`aprendizaje controlado: ${feedback.reason}`};
  if(health?.circuitOpen)return{provider:'openai',reason:`Workers AI pausado: ${health.reason}`};
  return{provider:'cloudflare',reason:health?.reason==='enfriamiento completado; se permite una prueba controlada'?'prueba controlada tras enfriamiento':'consulta breve, no sensible y de bajo costo'};
}

export async function callCloudflare(env:Bindings,instructions:string,input:string){
  if(!env.AI)throw new Error('Workers AI no está disponible');
  const model=env.CLOUDFLARE_MODEL_FAST||'@cf/meta/llama-3.1-8b-instruct-fast';
  const result=await env.AI.run(model as any,{messages:[{role:'system',content:instructions},{role:'user',content:input}],max_tokens:900} as any) as any;
  const text=typeof result==='string'?result:result?.response||result?.result?.response||'';
  if(!text.trim())throw new Error('Workers AI devolvió una respuesta vacía');
  return{text,id:`cf-${crypto.randomUUID()}`,model,usage:result?.usage||undefined};
}
