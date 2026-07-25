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

export type Qwen397EndpointSource='dedicated'|'huggingface-router';
export type Qwen397Endpoint={baseUrl:string;token:string;source:Qwen397EndpointSource;requestedModel:string;requestModel:string;selectionPolicy:'exact'|'cheapest';billingMode:'provider-account'|'huggingface-credits'};

export function resolveQwen397Endpoint(env:Bindings):Qwen397Endpoint|null{
  if(env.QWEN_397B_ENABLED==='false')return null;
  const requestedModel=env.QWEN_397B_MODEL?.trim()||QWEN_397_OPERATIONAL.repository;
  const dedicatedBase=env.QWEN_397B_BASE_URL?.trim(),dedicatedToken=env.QWEN_397B_TOKEN?.trim();
  if(dedicatedBase&&dedicatedToken)return{baseUrl:dedicatedBase,token:dedicatedToken,source:'dedicated',requestedModel,requestModel:requestedModel,selectionPolicy:'exact',billingMode:'provider-account'};
  const huggingFaceToken=env.HUGGINGFACE_TOKEN?.trim();
  if(huggingFaceToken){const baseUrl=(env.HECTOR_QWEN_BASE_URL||'https://router.huggingface.co/v1').trim();return{baseUrl,token:huggingFaceToken,source:'huggingface-router',requestedModel,requestModel:`${requestedModel}:cheapest`,selectionPolicy:'cheapest',billingMode:'huggingface-credits'};}
  return null;
}

export function hasQwen397Endpoint(env:Bindings){return Boolean(resolveQwen397Endpoint(env));}

export function qwen397Status(env:Bindings){
  const endpoint=resolveQwen397Endpoint(env),endpointConfigured=Boolean(endpoint);
  return{
    ...QWEN_397_OPERATIONAL,
    model:env.QWEN_397B_MODEL?.trim()||QWEN_397_OPERATIONAL.repository,
    label:env.QWEN_397B_LABEL?.trim()||QWEN_397_OPERATIONAL.label,
    enabled:env.QWEN_397B_ENABLED!=='false',
    endpointConfigured,
    endpointSource:endpoint?.source||null,
    selectionPolicy:endpoint?.selectionPolicy||null,
    billingMode:endpoint?.billingMode||null,
    mode:endpointConfigured?'endpoint':'pending-endpoint',
    reason:endpoint?.source==='dedicated'
      ?'Qwen3.5-397B-A17B está configurado mediante un endpoint OpenAI-compatible dedicado; se acredita únicamente si el proveedor reporta el modelo exacto.'
      :endpoint?.source==='huggingface-router'
        ?'Qwen3.5-397B-A17B usa el Hugging Face Router con el secreto existente, selección de proveedor cheapest y validación estricta del modelo efectivo.'
        :'Qwen3.5-397B-A17B es el cerebro principal solicitado, pero todavía falta un endpoint dedicado o HUGGINGFACE_TOKEN.'
  } as const;
}

function chatEndpoint(baseUrl:string){
  const normalized=baseUrl.replace(/\/$/,'');
  if(normalized.endsWith('/chat/completions'))return normalized;
  if(normalized.endsWith('/v1'))return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

export function normalizeQwen397Model(value:unknown){return String(value||'').trim().toLowerCase().split(':')[0].replace(/_/g,'-');}
export function verifyEffectiveQwen397Model(effective:unknown,requested=QWEN_397_OPERATIONAL.repository){
  if(!effective)throw new Error('El proveedor no reportó el modelo efectivo de Qwen 397B');
  if(normalizeQwen397Model(effective)!==normalizeQwen397Model(requested))throw new Error(`Modelo efectivo inesperado: solicitado=${requested}; recibido=${String(effective)}`);
  return String(effective);
}

type QwenContent=string|Array<{type:'text';text:string}|{type:'image_url';image_url:{url:string}}>;
type QwenMessage={role:'system'|'user'|'assistant';content:QwenContent};
type QwenChatResponse={id?:string;choices?:Array<{message?:{content?:string;reasoning_content?:string}}> ;usage?:{prompt_tokens?:number;completion_tokens?:number};error?:string|{message?:string};model?:string};

async function requestQwen397(env:Bindings,messages:QwenMessage[],maxTokens:number){
  if(env.QWEN_397B_ENABLED==='false')throw new Error('Qwen 397B está desactivado');
  const endpoint=resolveQwen397Endpoint(env);
  if(!endpoint)throw new Error('Qwen 397B no tiene endpoint dedicado ni HUGGINGFACE_TOKEN configurado');
  const configured=Number(env.QWEN_397B_TIMEOUT_MS);
  const timeoutMs=Number.isFinite(configured)&&configured>=1000?Math.min(240_000,configured):180_000;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(chatEndpoint(endpoint.baseUrl),{
      method:'POST',
      headers:{Authorization:`Bearer ${endpoint.token}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:endpoint.requestModel,messages,max_tokens:maxTokens,temperature:.6,top_p:.95,stream:false}),
      signal:controller.signal
    });
    const data=await response.json() as QwenChatResponse;
    const error=typeof data.error==='string'?data.error:data.error?.message;
    if(!response.ok)throw new Error(error||`El endpoint de Qwen respondió ${response.status}`);
    const text=data.choices?.[0]?.message?.content||'';
    if(!text.trim())throw new Error('Qwen 397B devolvió una respuesta vacía');
    const effectiveModel=verifyEffectiveQwen397Model(data.model,endpoint.requestedModel);
    return{text,reasoningContent:data.choices?.[0]?.message?.reasoning_content,id:data.id||`qwen397-${crypto.randomUUID()}`,model:effectiveModel,requestedModel:endpoint.requestedModel,endpointSource:endpoint.source,selectionPolicy:endpoint.selectionPolicy,billingMode:endpoint.billingMode,usage:{input_tokens:data.usage?.prompt_tokens,output_tokens:data.usage?.completion_tokens},runtime:QWEN_397_OPERATIONAL};
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')throw new Error('Qwen 397B excedió el tiempo permitido');
    throw error;
  }finally{clearTimeout(timer);}
}

export function callQwen397(env:Bindings,instructions:string,messages:Array<{role:'user'|'assistant';content:string}>){return requestQwen397(env,[{role:'system',content:instructions},...messages],4096);}
export function callQwen397Vision(env:Bindings,prompt:string,dataUrl:string){return requestQwen397(env,[{role:'system',content:'Analiza imágenes con precisión. Separa observaciones, inferencias y límites. Responde en español salvo petición contraria.'},{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:dataUrl}}]}],2048);}
