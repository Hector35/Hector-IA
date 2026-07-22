import type { Bindings } from '../types';
import type {ProviderHealth} from './provider-quality';
import type {FeedbackRoutingProfile} from './feedback-routing';
import {cloudflareFreeProfile,detectFreeCapability,tryDeterministicFreeInference,withTimeout} from './free-first';
export type ProviderName='cloudflare'|'openai';
export type ProviderDecision={provider:ProviderName;reason:string};
const sensitiveSignals=/\b(salud|médic|medic|dolor|síntoma|sintoma|dosis|finanzas|dinero|saldo|banco|contraseña|password|token|secreto|privado|personal|legal|demanda|contrato)\b/i;
const complexSignals=/\b(código|codigo|arquitectura|debug|depura|audita|implementa|refactoriza|investiga|compara|estrategia|modelo completo|razona|demuestra|github|cloudflare|d1|r2|deploy|workflow)\b/i;
export function chooseProvider(input:string,tier:'fast'|'balanced'|'deep',needsWeb:boolean,enabled=true,health?:ProviderHealth,feedback?:FeedbackRoutingProfile):ProviderDecision{
 const deterministic=tryDeterministicFreeInference(input);if(deterministic)return{provider:'cloudflare',reason:`operación ${deterministic.capability} resuelta con reglas locales sin inferencia`};
 if(!enabled)return{provider:'openai',reason:'Workers AI desactivado'};
 if(needsWeb)return{provider:'openai',reason:'requiere búsqueda web integrada'};
 if(sensitiveSignals.test(input))return{provider:'openai',reason:'contenido sensible o privado'};
 if(complexSignals.test(input))return{provider:'openai',reason:'tarea técnica o compleja'};
 if(feedback?.avoidCloudflare)return{provider:'openai',reason:`aprendizaje del libro mayor: ${feedback.reason}`};
 if(health?.circuitOpen)return{provider:'openai',reason:`Workers AI pausado: ${health.reason}`};
 const capability=detectFreeCapability(input);if(capability!=='general')return{provider:'cloudflare',reason:`capacidad ligera ${capability} asignada al escalón gratuito`};
 if(tier!=='fast')return{provider:'openai',reason:'requiere razonamiento balanceado o profundo'};
 return{provider:'cloudflare',reason:health?.reason==='enfriamiento completado; se permite una prueba controlada'?'prueba controlada tras enfriamiento':'consulta breve, no sensible y de bajo costo'};
}
export async function callCloudflare(env:Bindings,instructions:string,input:string){
 const deterministic=tryDeterministicFreeInference(input);if(deterministic)return{text:deterministic.text,id:`rules-${crypto.randomUUID()}`,model:'hector-rules-v1',usage:{input_tokens:0,output_tokens:0},capability:deterministic.capability};
 if(!env.AI)throw new Error('Workers AI no está disponible');
 const profile=cloudflareFreeProfile(env,input);
 const result=await withTimeout(env.AI.run(profile.model as any,{messages:[{role:'system',content:instructions},{role:'user',content:input}],max_tokens:profile.maxTokens,temperature:profile.temperature} as any) as any,profile.timeoutMs) as any;
 const text=typeof result==='string'?result:result?.response||result?.result?.response||'';if(!text.trim())throw new Error('Workers AI devolvió una respuesta vacía');
 return{text,id:`cf-${crypto.randomUUID()}`,model:profile.model,usage:result?.usage||undefined,capability:profile.capability};
}
