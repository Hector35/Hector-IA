import type {Bindings} from '../types';

export const KIMI_K2_5_OPERATIONAL={
  runtimeId:'hector-kimi',
  repository:'moonshotai/Kimi-K2.5',
  label:'Héctor Kimi K2.5',
  role:'operational-multimodal-agent',
  totalParameters:'1T',
  activeParameters:'32B',
  contextLength:262144,
  multimodal:true,
  thinking:true,
  customWeights:false
} as const;

export const KIMI_K2_BASE_TRAINING={
  repository:'moonshotai/Kimi-K2-Base',
  label:'Kimi K2 Base · objetivo entrenable',
  role:'trainable-foundation',
  totalParameters:'1T',
  activeParameters:'32B',
  contextLength:131072,
  customWeights:false
} as const;

export function hasKimiEndpoint(env:Bindings){
  return env.KIMI_K2_ENABLED!=='false'&&Boolean(env.KIMI_K2_BASE_URL?.trim())&&Boolean(env.KIMI_K2_TOKEN?.trim());
}

export function kimiStatus(env:Bindings){
  const endpointConfigured=hasKimiEndpoint(env);
  return{
    ...KIMI_K2_5_OPERATIONAL,
    model:env.KIMI_K2_MODEL||KIMI_K2_5_OPERATIONAL.repository,
    label:env.KIMI_K2_LABEL||KIMI_K2_5_OPERATIONAL.label,
    enabled:env.KIMI_K2_ENABLED!=='false',
    endpointConfigured,
    mode:endpointConfigured?'endpoint':'pending-endpoint',
    reason:endpointConfigured
      ?'Kimi K2.5 está conectado mediante un endpoint OpenAI-compatible.'
      :'Kimi K2.5 está integrado como cerebro operativo; falta configurar el endpoint y su secreto.',
    trainingTarget:KIMI_K2_BASE_TRAINING
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
  choices?:Array<{message?:{content?:string;reasoning_content?:string}}>;
  usage?:{prompt_tokens?:number;completion_tokens?:number};
  error?:string|{message?:string};
};

export async function callKimiK2_5(env:Bindings,instructions:string,messages:Array<{role:'user'|'assistant';content:string}>){
  if(env.KIMI_K2_ENABLED==='false')throw new Error('Kimi K2.5 está desactivado');
  if(!hasKimiEndpoint(env))throw new Error('Kimi K2.5 está integrado, pero falta conectar su endpoint');
  const configured=Number(env.KIMI_K2_TIMEOUT_MS);
  const timeoutMs=Number.isFinite(configured)&&configured>=1000?Math.min(180_000,configured):120_000;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const model=env.KIMI_K2_MODEL||KIMI_K2_5_OPERATIONAL.repository;
  try{
    const response=await fetch(chatEndpoint(env.KIMI_K2_BASE_URL!),{
      method:'POST',
      headers:{Authorization:`Bearer ${env.KIMI_K2_TOKEN!.trim()}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        messages:[{role:'system',content:instructions},...messages],
        max_tokens:4096,
        temperature:1,
        top_p:.95,
        stream:false
      }),
      signal:controller.signal
    });
    const data=await response.json() as KimiChatResponse;
    const error=typeof data.error==='string'?data.error:data.error?.message;
    if(!response.ok)throw new Error(error||`El endpoint de Kimi respondió ${response.status}`);
    const text=data.choices?.[0]?.message?.content||'';
    if(!text.trim())throw new Error('Kimi K2.5 devolvió una respuesta vacía');
    return{
      text,
      reasoningContent:data.choices?.[0]?.message?.reasoning_content,
      id:data.id||`kimi-${crypto.randomUUID()}`,
      model,
      usage:{input_tokens:data.usage?.prompt_tokens,output_tokens:data.usage?.completion_tokens},
      runtime:KIMI_K2_5_OPERATIONAL
    };
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')throw new Error('Kimi K2.5 excedió el tiempo permitido');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}
