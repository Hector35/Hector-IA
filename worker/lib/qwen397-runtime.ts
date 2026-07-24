import type {Bindings} from '../types';

export const QWEN_397_OPERATIONAL={
  runtimeId:'hector-qwen397',
  repository:'Qwen/Qwen3.5-397B-A17B',
  label:'Héctor Qwen 397B',
  role:'operational-multimodal-moe',
  totalParameters:'397B',
  activeParameters:'17B',
  contextLength:262144,
  extendedContextLength:1010000,
  multimodal:true,
  thinking:true,
  trainable:true,
  license:'Apache-2.0',
  customWeights:false
} as const;

export function hasQwen397Endpoint(env:Bindings){
  return env.QWEN_397B_ENABLED!=='false'&&Boolean(env.QWEN_397B_BASE_URL?.trim())&&Boolean(env.QWEN_397B_TOKEN?.trim());
}

export function qwen397Status(env:Bindings){
  const endpointConfigured=hasQwen397Endpoint(env);
  return{
    ...QWEN_397_OPERATIONAL,
    model:env.QWEN_397B_MODEL?.trim()||QWEN_397_OPERATIONAL.repository,
    label:env.QWEN_397B_LABEL?.trim()||QWEN_397_OPERATIONAL.label,
    enabled:env.QWEN_397B_ENABLED!=='false',
    endpointConfigured,
    mode:!endpointConfigured?'pending-endpoint':'endpoint',
    reason:endpointConfigured
      ?'Qwen3.5-397B-A17B está conectado mediante un endpoint OpenAI-compatible.'
      :'Qwen3.5-397B-A17B está integrado como cerebro principal; falta configurar endpoint y secreto.'
  } as const;
}

function chatEndpoint(baseUrl:string){
  const normalized=baseUrl.replace(/\/$/,'');
  if(normalized.endsWith('/chat/completions'))return normalized;
  if(normalized.endsWith('/v1'))return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

type QwenChatResponse={
  id?:string;
  choices?:Array<{message?:{content?:string;reasoning_content?:string}}>;
  usage?:{prompt_tokens?:number;completion_tokens?:number};
  error?:string|{message?:string};
};

export async function callQwen397(env:Bindings,instructions:string,messages:Array<{role:'user'|'assistant';content:string}>){
  if(env.QWEN_397B_ENABLED==='false')throw new Error('Qwen 397B está desactivado');
  if(!hasQwen397Endpoint(env))throw new Error('Qwen 397B está integrado, pero falta conectar su endpoint');
  const configured=Number(env.QWEN_397B_TIMEOUT_MS);
  const timeoutMs=Number.isFinite(configured)&&configured>=1000?Math.min(240_000,configured):180_000;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const model=env.QWEN_397B_MODEL?.trim()||QWEN_397_OPERATIONAL.repository;
  try{
    const response=await fetch(chatEndpoint(env.QWEN_397B_BASE_URL!),{
      method:'POST',
      headers:{Authorization:`Bearer ${env.QWEN_397B_TOKEN!.trim()}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        messages:[{role:'system',content:instructions},...messages],
        max_tokens:4096,
        temperature:.6,
        top_p:.95,
        stream:false
      }),
      signal:controller.signal
    });
    const data=await response.json() as QwenChatResponse;
    const error=typeof data.error==='string'?data.error:data.error?.message;
    if(!response.ok)throw new Error(error||`El endpoint de Qwen respondió ${response.status}`);
    const text=data.choices?.[0]?.message?.content||'';
    if(!text.trim())throw new Error('Qwen 397B devolvió una respuesta vacía');
    return{
      text,
      reasoningContent:data.choices?.[0]?.message?.reasoning_content,
      id:data.id||`qwen397-${crypto.randomUUID()}`,
      model,
      usage:{input_tokens:data.usage?.prompt_tokens,output_tokens:data.usage?.completion_tokens},
      runtime:QWEN_397_OPERATIONAL
    };
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')throw new Error('Qwen 397B excedió el tiempo permitido');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}
