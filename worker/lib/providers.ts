import type { Bindings } from '../types';
import type {ProviderHealth} from './provider-quality';
import type {FeedbackRoutingProfile} from './feedback-routing';
import {cloudflareFreeProfile,detectFreeCapability,tryDeterministicFreeInference,withTimeout} from './free-first';

export type ProviderName='cloudflare'|'openai';
export type ProviderDecision={provider:ProviderName;reason:string};

export const HECTOR_BASE_RUNTIME={id:'hector-base',label:'Héctor Base',status:'active',customWeights:false} as const;

const sensitiveSignals=/\b(salud|médic|medic|dolor|síntoma|sintoma|dosis|finanzas|dinero|saldo|banco|contraseña|password|token|secreto|privado|personal|legal|demanda|contrato)\b/i;
const complexSignals=/\b(código|codigo|arquitectura|debug|depura|audita|implementa|refactoriza|investiga|compara|estrategia|modelo completo|razona|demuestra|github|cloudflare|d1|r2|deploy|workflow)\b/i;
const explicitBaseRequest=/\b(h[eé]ctor base|usa (?:tu|el) modelo abierto|habla con (?:tu|el) modelo abierto|sin openai|solo workers ai)\b/i;

export function chooseProvider(input:string,tier:'fast'|'balanced'|'deep',needsWeb:boolean,enabled=true,health?:ProviderHealth,feedback?:FeedbackRoutingProfile):ProviderDecision{
 const deterministic=tryDeterministicFreeInference(input);
 if(deterministic)return{provider:'cloudflare',reason:`Héctor Base resolvió ${deterministic.capability} con reglas locales sin inferencia`};
 if(!enabled)return{provider:'openai',reason:'Workers AI desactivado'};
 if(needsWeb)return{provider:'openai',reason:'requiere búsqueda web integrada'};
 if(sensitiveSignals.test(input))return{provider:'openai',reason:'contenido sensible o privado'};
 if(explicitBaseRequest.test(input))return{provider:'cloudflare',reason:'el usuario solicitó explícitamente Héctor Base'};
 if(complexSignals.test(input))return{provider:'openai',reason:'tarea técnica o compleja'};
 if(feedback?.avoidCloudflare)return{provider:'openai',reason:`aprendizaje del libro mayor: ${feedback.reason}`};
 if(health?.circuitOpen)return{provider:'openai',reason:`Workers AI pausado: ${health.reason}`};
 const capability=detectFreeCapability(input);
 if(capability!=='general')return{provider:'cloudflare',reason:`Héctor Base ejecutará la capacidad ligera ${capability}`};
 if(tier!=='fast')return{provider:'openai',reason:'requiere razonamiento balanceado o profundo'};
 return{provider:'cloudflare',reason:health?.reason==='enfriamiento completado; se permite una prueba controlada'?'prueba controlada de Héctor Base tras enfriamiento':'Héctor Base atiende la conversación ordinaria'};
}

export async function callCloudflare(env:Bindings,instructions:string,input:string){
 const deterministic=tryDeterministicFreeInference(input);
 if(deterministic)return{text:deterministic.text,id:`rules-${crypto.randomUUID()}`,model:'hector-rules-v1',usage:{input_tokens:0,output_tokens:0},capability:deterministic.capability,runtime:HECTOR_BASE_RUNTIME};
 if(!env.AI)throw new Error('Workers AI no está disponible');
 const profile=cloudflareFreeProfile(env,input);
 const result=await withTimeout(Promise.resolve(env.AI.run(profile.model as any,{messages:[{role:'system',content:instructions},{role:'user',content:input}],max_tokens:profile.maxTokens,temperature:profile.temperature} as any) as any),profile.timeoutMs) as any;
 const text=typeof result==='string'?result:result?.response||result?.result?.response||'';
 if(!text.trim())throw new Error('Workers AI devolvió una respuesta vacía');
 return{text,id:`cf-${crypto.randomUUID()}`,model:profile.model,usage:result?.usage||undefined,capability:profile.capability,runtime:HECTOR_BASE_RUNTIME};
}
