import type {Bindings} from '../types';

export const KIMI_K2_BASE={
  runtimeId:'hector-kimi',
  repository:'moonshotai/Kimi-K2-Base',
  label:'Héctor Kimi K2 Base',
  totalParameters:'1T',
  activeParameters:'32B',
  contextLength:131072,
  customWeights:false
} as const;

export function hasKimiK2Endpoint(env:Bindings){
  return env.KIMI_K2_ENABLED!=='false'&&Boolean(env.KIMI_K2_BASE_URL?.trim())&&Boolean(env.KIMI_K2_TOKEN?.trim());
}

export function kimiK2Status(env:Bindings){
  const endpointConfigured=hasKimiK2Endpoint(env);
  return{
    ...KIMI_K2_BASE,
    model:env.KIMI_K2_MODEL||KIMI_K2_BASE.repository,
    label:env.KIMI_K2_LABEL||KIMI_K2_BASE.label,
    enabled:env.KIMI_K2_ENABLED!=='false',
    endpointConfigured,
    mode:endpointConfigured?'endpoint':'pending-endpoint',
    reason:endpointConfigured?'Endpoint OpenAI-compatible conectado':'La PWA está preparada; faltan KIMI_K2_BASE_URL y el secreto KIMI_K2_TOKEN.'
  } as const;
}

function chatEndpoint(baseUrl:string){
  const normalized=baseUrl.replace(/\/$/,'');
  if(normalized.endsWith('/chat/completions'))return normalized;
  if(normalized.endsWith('/v1'))return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

type KimiChatResponse={
  id?:string;
  choices?:Array<{message?:{content?:string}}>;
  usage?:{prompt_tokens?:number;completion_tokens?:number};
  error?:string|{message?:string};
};

export async function callKimiK2Base(env:Bindings,instructions:string,messages:Array<{role:'user'|'assistant';content:string}>){
  if(env.KIMI_K2_ENABLED==='false')throw new Error('Kimi K2 Base está desactivado');
  if(!hasKimiK2Endpoint(env))throw new Error('Kimi K2 Base está preparado en la PWA, pero falta conectar su endpoint GPU');
  const configured=Number(env.KIMI_K2_TIMEOUT_MS);
  const timeoutMs=Number.isFinite(configured)&&configured>=1000?Math.min(180_000,configured):120_000;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const model=env.KIMI_K2_MODEL||KIMI_K2_BASE.repository;
  try{
    const response=await fetch(chatEndpoint(env.KIMI_K2_BASE_URL!),{
      method:'POST',
      headers:{Authorization:`Bearer ${env.KIMI_K2_TOKEN!.trim()}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,messages:[{role:'system',content:instructions},...messages],max_tokens:1400,temperature:.2}),
      signal:controller.signal
    });
    const data=await response.json() as KimiChatResponse;
    const error=typeof data.error==='string'?data.error:data.error?.message;
    if(!response.ok)throw new Error(error||`El endpoint de Kimi respondió ${response.status}`);
    const text=data.choices?.[0]?.message?.content||'';
    if(!text.trim())throw new Error('Kimi K2 Base devolvió una respuesta vacía');
    return{
      text,
      id:data.id||`kimi-${crypto.randomUUID()}`,
      model,
      usage:{input_tokens:data.usage?.prompt_tokens,output_tokens:data.usage?.completion_tokens},
      runtime:KIMI_K2_BASE
    };
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')throw new Error('Kimi K2 Base excedió el tiempo permitido');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}
