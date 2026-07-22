import type {Bindings} from '../types';
import type {ProviderHealth} from './provider-quality';
import type {FeedbackRoutingProfile} from './feedback-routing';
import {cloudflareFreeProfile,detectFreeCapability,tryDeterministicFreeInference,withTimeout} from './free-first';

export type ProviderName='cloudflare'|'huggingface'|'openai';
export type ProviderDecision={provider:ProviderName;reason:string};

export const HECTOR_BASE_RUNTIME={id:'hector-base',label:'Héctor Base',status:'active',customWeights:false} as const;
export const HECTOR_QWEN_RUNTIME={id:'hector-qwen-base',label:'Héctor Qwen Base',status:'provisional',customWeights:false,baseModel:'Qwen/Qwen3-4B-Instruct-2507'} as const;
export const CHAT_RUNTIME_POLICY={providers:['huggingface','cloudflare'],openAIAllowed:false,openAIRole:'training-and-evaluation-only'} as const;

const sensitiveSignals=/\b(salud|médic|medic|dolor|síntoma|sintoma|dosis|finanzas|dinero|saldo|banco|contraseña|password|token|secreto|privado|personal|legal|demanda|contrato)\b/i;
const complexSignals=/\b(código|codigo|arquitectura|debug|depura|audita|implementa|refactoriza|investiga|compara|estrategia|modelo completo|razona|demuestra|github|cloudflare|d1|r2|deploy|workflow)\b/i;
const explicitBaseRequest=/\b(h[eé]ctor base|usa (?:tu|el) modelo abierto|habla con (?:tu|el) modelo abierto|sin openai|solo workers ai)\b/i;
const explicitQwenRequest=/\b(h[eé]ctor qwen|qwen3[- ]?4b|qwen 3 4b|usa qwen|habla con qwen|modelo qwen)\b/i;

export function requestsQwen(input:string){return explicitQwenRequest.test(input);}

export function chooseProvider(input:string,tier:'fast'|'balanced'|'deep',needsWeb:boolean,enabled=true,health?:ProviderHealth,feedback?:FeedbackRoutingProfile,qwenConfigured=false):ProviderDecision{
 const deterministic=tryDeterministicFreeInference(input);
 if(deterministic)return{provider:'cloudflare',reason:`Héctor Base resolvió ${deterministic.capability} con reglas locales sin inferencia`};
 if(explicitBaseRequest.test(input))return{provider:'cloudflare',reason:'el usuario solicitó explícitamente Héctor Base en Workers AI'};
 if(explicitQwenRequest.test(input))return qwenConfigured
  ?{provider:'huggingface',reason:'el usuario solicitó explícitamente Héctor Qwen'}
  :{provider:'cloudflare',reason:'Héctor Qwen aún no tiene credencial de inferencia; se usa la base abierta de Workers AI sin OpenAI'};
 if(qwenConfigured){
  const limits=[needsWeb?'sin navegación web en vivo':null,sensitiveSignals.test(input)?'respuesta conservadora':null,complexSignals.test(input)||tier!=='fast'?'tarea compleja atendida por Qwen abierto':null].filter(Boolean).join('; ');
  return{provider:'huggingface',reason:`Héctor Qwen es el modelo conversacional preferido${limits?`; ${limits}`:''}`};
 }
 if(!enabled)return{provider:'cloudflare',reason:'Qwen no está configurado y Workers AI está desactivado; OpenAI no está autorizado en el chat'};
 if(needsWeb)return{provider:'cloudflare',reason:'Héctor Base atiende sin navegación externa; debe reconocer que no puede verificar información actual'};
 if(sensitiveSignals.test(input))return{provider:'cloudflare',reason:'Héctor Base atiende con política conservadora; OpenAI no está autorizado en el chat'};
 if(complexSignals.test(input)||tier!=='fast')return{provider:'cloudflare',reason:'Héctor Base atiende la tarea compleja sin escalamiento a OpenAI'};
 if(feedback?.avoidCloudflare)return{provider:'cloudflare',reason:`la calidad reciente exige cautela, pero OpenAI está reservado para entrenamiento: ${feedback.reason}`};
 if(health?.circuitOpen)return{provider:'cloudflare',reason:`Workers AI reporta degradación y el chat no tiene fallback externo: ${health.reason}`};
 const capability=detectFreeCapability(input);
 if(capability!=='general')return{provider:'cloudflare',reason:`Héctor Base ejecutará la capacidad ligera ${capability}`};
 return{provider:'cloudflare',reason:health?.reason==='enfriamiento completado; se permite una prueba controlada'?'prueba controlada de Héctor Base tras enfriamiento':'Héctor Base es el runtime abierto disponible; OpenAI no participa en el chat'};
}

export async function callCloudflare(env:Bindings,instructions:string,input:string){
 const deterministic=tryDeterministicFreeInference(input);
 if(deterministic)return{text:deterministic.text,id:`rules-${crypto.randomUUID()}`,model:'hector-rules-v1',usage:{input_tokens:0,output_tokens:0},capability:deterministic.capability,runtime:HECTOR_BASE_RUNTIME};
 if(env.CLOUDFLARE_AI_ENABLED==='false')throw new Error('Héctor Base está desactivado y OpenAI no está autorizado para responder el chat');
 if(!env.AI)throw new Error('Workers AI no está disponible; el chat no enviará el mensaje a OpenAI');
 const profile=cloudflareFreeProfile(env,input);
 const result=await withTimeout(Promise.resolve(env.AI.run(profile.model as any,{messages:[{role:'system',content:instructions},{role:'user',content:input}],max_tokens:profile.maxTokens,temperature:profile.temperature} as any) as any),profile.timeoutMs) as any;
 const text=typeof result==='string'?result:result?.response||result?.result?.response||'';
 if(!text.trim())throw new Error('Héctor Base devolvió una respuesta vacía; no se usará OpenAI como fallback');
 return{text,id:`cf-${crypto.randomUUID()}`,model:profile.model,usage:result?.usage||undefined,capability:profile.capability,runtime:HECTOR_BASE_RUNTIME};
}

type QwenTurn={role:'user'|'assistant';content:string};
type HuggingFaceChatResponse={id?:string;choices?:Array<{message?:{content?:string}}>;usage?:{prompt_tokens?:number;completion_tokens?:number};error?:{message?:string}|string};

function stripQwenDirective(value:string){const stripped=value.replace(/^\s*(?:h[eé]ctor qwen|qwen3[- ]?4b|qwen 3 4b|usa qwen|habla con qwen|modelo qwen)\s*[:\-–—]?\s*/i,'').trim();return stripped||value.trim();}
function qwenMessages(input:unknown):Array<{role:'system'|'user'|'assistant';content:string}>{
 if(Array.isArray(input))return input.filter((turn):turn is QwenTurn=>Boolean(turn)&&typeof turn==='object'&&((turn as QwenTurn).role==='user'||(turn as QwenTurn).role==='assistant')&&typeof (turn as QwenTurn).content==='string').map((turn,index,items)=>({role:turn.role,content:turn.role==='user'&&index===items.length-1?stripQwenDirective(turn.content):turn.content}));
 return[{role:'user',content:stripQwenDirective(String(input??''))}];
}

export async function callHuggingFaceQwen(env:Bindings,instructions:string,input:unknown){
 if(env.HECTOR_QWEN_ENABLED==='false')throw new Error('Héctor Qwen está desactivado');
 const token=env.HUGGINGFACE_TOKEN?.trim();
 if(!token)throw new Error('Héctor Qwen aún no puede responder: falta configurar el secreto HUGGINGFACE_TOKEN');
 const baseUrl=(env.HECTOR_QWEN_BASE_URL||'https://router.huggingface.co/v1').replace(/\/$/,'');
 const model=env.HECTOR_QWEN_MODEL||HECTOR_QWEN_RUNTIME.baseModel;
 const configuredTimeout=Number(env.HECTOR_QWEN_TIMEOUT_MS),timeoutMs=Number.isFinite(configuredTimeout)&&configuredTimeout>=1000?Math.min(60_000,configuredTimeout):30_000;
 const response=await withTimeout(fetch(`${baseUrl}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:instructions},...qwenMessages(input)],max_tokens:1000,temperature:.25})}),timeoutMs,'Héctor Qwen excedió el tiempo permitido');
 const data=await response.json() as HuggingFaceChatResponse;
 const error=typeof data.error==='string'?data.error:data.error?.message;
 if(!response.ok)throw new Error(error||`Hugging Face respondió ${response.status}`);
 const text=data.choices?.[0]?.message?.content||'';
 if(!text.trim())throw new Error('Héctor Qwen devolvió una respuesta vacía');
 return{text,id:data.id||`hf-${crypto.randomUUID()}`,model,usage:{input_tokens:data.usage?.prompt_tokens,output_tokens:data.usage?.completion_tokens},runtime:HECTOR_QWEN_RUNTIME};
}
