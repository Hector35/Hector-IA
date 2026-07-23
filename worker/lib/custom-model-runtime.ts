import type {Bindings} from '../types';
import {CHAT_CHAMPION} from './chat-champion';

export type HectorRuntimeId='auto'|'hector-base'|'hector-qwen'|'hector-experimental';
export const HECTOR_RUNTIME_IDS=['auto','hector-base','hector-qwen','hector-experimental'] as const;

export type HectorRuntimeCatalogItem={
 id:HectorRuntimeId;
 label:string;
 description:string;
 available:boolean;
 customWeights:boolean;
 status:'active'|'configured'|'queued'|'trained-offline'|'disabled';
 model?:string;
 reason?:string;
};

type CustomBindings=Bindings&{
 HECTOR_CUSTOM_MODEL_ENABLED?:string;
 HECTOR_CUSTOM_MODEL_ID?:string;
 HECTOR_CUSTOM_MODEL_LABEL?:string;
 HECTOR_CUSTOM_MODEL_BASE_URL?:string;
 HECTOR_CUSTOM_MODEL_TOKEN?:string;
 HECTOR_CUSTOM_MODEL_NAME?:string;
 HECTOR_CUSTOM_MODEL_TIMEOUT_MS?:string;
};

export function normalizeHectorRuntime(value:unknown):HectorRuntimeId{
 return HECTOR_RUNTIME_IDS.includes(value as HectorRuntimeId)?value as HectorRuntimeId:'auto';
}

export function requestedHectorRuntime(message:string):HectorRuntimeId{
 const text=message.trim();
 if(/^\/modelos?\s*$/i.test(text))return'auto';
 if(/^(?:\/modelo\s+)?(?:h[eé]ctor\s+)?base\b|\b(?:usa|habla con|responde con)\s+(?:h[eé]ctor\s+)?base\b/i.test(text))return'hector-base';
 if(/^(?:\/modelo\s+)?(?:h[eé]ctor\s+)?qwen\b|\b(?:usa|habla con|responde con)\s+(?:h[eé]ctor\s+)?qwen\b/i.test(text))return'hector-qwen';
 if(/^(?:\/modelo\s+)?(?:propio|experimental|qwen15(?:-v\d+)?)\b|\b(?:usa|habla con|responde con)\s+(?:mi|tu|el)\s+modelo(?:\s+propio|\s+experimental)?\b|\bhector-asi-qwen15-v\d+\b/i.test(text))return'hector-experimental';
 return'auto';
}

export function stripHectorRuntimeDirective(message:string){
 const stripped=message
  .replace(/^\s*\/modelo\s+(?:h[eé]ctor\s+)?(?:qwen15(?:-v\d+)?|experimental|propio|base|qwen)\b\s*[:\-–—]?\s*/i,'')
  .replace(/^\s*(?:usa|habla con|responde con)\s+(?:hector-asi-qwen15-v\d+|(?:mi|tu|el)\s+modelo(?:\s+propio|\s+experimental)?|(?:h[eé]ctor\s+)?(?:base|qwen))\b\s*[:\-–—]?\s*/i,'')
  .trim();
 return stripped||message.trim();
}

export function hasCustomModelEndpoint(env:Bindings){
 const custom=env as CustomBindings;
 return custom.HECTOR_CUSTOM_MODEL_ENABLED!=='false'&&Boolean(custom.HECTOR_CUSTOM_MODEL_BASE_URL?.trim())&&Boolean((custom.HECTOR_CUSTOM_MODEL_TOKEN||env.HUGGINGFACE_TOKEN)?.trim());
}

export function hasQueuedCustomInference(_env:Bindings){return true;}

export function hectorRuntimeCatalog(env:Bindings):HectorRuntimeCatalogItem[]{
 const custom=env as CustomBindings,endpointConfigured=hasCustomModelEndpoint(env),immediate=Boolean(env.GITHUB_RUNNER_TOKEN?.trim());
 const reason=endpointConfigured?'Endpoint neuronal personalizado configurado':immediate?'Los pesos se ejecutan bajo demanda en GitHub Actions mediante despacho inmediato':'Los pesos se ejecutan en GitHub Actions; la cola programada se revisa automáticamente cada cinco minutos';
 return[
  {id:'auto',label:'Automático',description:'Héctor elige el runtime disponible más adecuado.',available:true,customWeights:false,status:'active'},
  {id:'hector-base',label:'Héctor Base',description:'Workers AI y reglas locales.',available:env.CLOUDFLARE_AI_ENABLED!=='false'&&Boolean(env.AI),customWeights:false,status:env.CLOUDFLARE_AI_ENABLED!=='false'&&Boolean(env.AI)?'active':'disabled',model:env.CLOUDFLARE_MODEL_FAST},
  {id:'hector-qwen',label:'Héctor Qwen',description:'Qwen abierto mediante Hugging Face.',available:env.HECTOR_QWEN_ENABLED!=='false'&&Boolean(env.HUGGINGFACE_TOKEN?.trim()),customWeights:false,status:env.HECTOR_QWEN_ENABLED!=='false'&&Boolean(env.HUGGINGFACE_TOKEN?.trim())?'active':'disabled',model:env.HECTOR_QWEN_MODEL},
  {id:'hector-experimental',label:custom.HECTOR_CUSTOM_MODEL_LABEL||CHAT_CHAMPION.label,description:endpointConfigured?'Adaptador neuronal propio servido por un endpoint dedicado.':'Adaptador neuronal propio cargado bajo demanda en cómputo gratuito reproducible.',available:true,customWeights:true,status:endpointConfigured?'configured':'queued',model:custom.HECTOR_CUSTOM_MODEL_ID||CHAT_CHAMPION.runtimeId,reason}
 ];
}

export function renderHectorRuntimeCatalog(env:Bindings){
 const lines=hectorRuntimeCatalog(env).map(item=>`- **${item.label}** (${item.id}): ${item.available?item.status==='queued'?'disponible bajo demanda':'disponible':item.status==='trained-offline'?'entrenado, falta runtime':'no disponible'}${item.model?` · ${item.model}`:''}${item.reason?` · ${item.reason}`:''}`);
 return `## Modelos de Héctor ASI\n${lines.join('\n')}\n\nComandos: \`/modelo base <mensaje>\`, \`/modelo qwen <mensaje>\` o \`/modelo propio <mensaje>\`.`;
}

function endpoint(baseUrl:string){const normalized=baseUrl.replace(/\/$/,'');return normalized.endsWith('/chat/completions')?normalized:`${normalized}/chat/completions`;}

type CustomChatResponse={id?:string;choices?:Array<{message?:{content?:string}}>;usage?:{prompt_tokens?:number;completion_tokens?:number};error?:string|{message?:string}};

export async function callHectorExperimental(env:Bindings,instructions:string,messages:Array<{role:'user'|'assistant';content:string}>){
 const custom=env as CustomBindings;
 if(!hasCustomModelEndpoint(env))throw new Error('El endpoint dedicado del modelo propio no está configurado');
 const token=(custom.HECTOR_CUSTOM_MODEL_TOKEN||env.HUGGINGFACE_TOKEN||'').trim();
 const timeout=Number(custom.HECTOR_CUSTOM_MODEL_TIMEOUT_MS),timeoutMs=Number.isFinite(timeout)&&timeout>=1000?Math.min(120_000,timeout):60_000;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetch(endpoint(custom.HECTOR_CUSTOM_MODEL_BASE_URL!),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({model:custom.HECTOR_CUSTOM_MODEL_NAME||custom.HECTOR_CUSTOM_MODEL_ID||CHAT_CHAMPION.runtimeId,messages:[{role:'system',content:instructions},...messages],max_tokens:1000,temperature:.25}),signal:controller.signal});
  const data=await response.json() as CustomChatResponse;
  const error=typeof data.error==='string'?data.error:data.error?.message;
  if(!response.ok)throw new Error(error||`El endpoint experimental respondió ${response.status}`);
  const text=data.choices?.[0]?.message?.content||'';
  if(!text.trim())throw new Error('El modelo experimental devolvió una respuesta vacía');
  return{text,id:data.id||`custom-${crypto.randomUUID()}`,model:custom.HECTOR_CUSTOM_MODEL_ID||CHAT_CHAMPION.runtimeId,usage:{input_tokens:data.usage?.prompt_tokens,output_tokens:data.usage?.completion_tokens}};
 }catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw new Error('El modelo experimental excedió el tiempo permitido');throw error;}finally{clearTimeout(timer);}
}
