import type {Bindings} from '../types';
import {withTimeout} from './free-first';

export const VISTA_RUNTIME={
  id:'hector-vista',
  model:'inclusionAI/VISTA-9B',
  label:'Héctor VISTA-9B',
  role:'gui-grounding',
  parameters:'9B',
  license:'Apache-2.0'
} as const;

type VistaChatResponse={
  id?:string;
  choices?:Array<{message?:{content?:string}}>;
  usage?:{prompt_tokens?:number;completion_tokens?:number};
  error?:{message?:string}|string;
};

export type VistaCoordinate={x:number;y:number;scale:1000};

const guiSignals=/\b(d[oó]nde (?:toco|pulso|presiono|hago clic)|qu[eé] bot[oó]n|localiza|ubica|encuentra|toca|pulsa|presiona|haz clic|selecciona|abre|cierra|activa|desactiva|men[uú]|icono|control|campo|pesta[nñ]a|switch|checkbox|captura|pantalla|interfaz|app|pwa|iphone)\b/i;

export function isGuiGroundingPrompt(prompt:string){
  return guiSignals.test(prompt);
}

export function parseVistaCoordinate(value:string):VistaCoordinate|null{
  const match=value.match(/\[\s*(-?\d{1,4}(?:\.\d+)?)\s*,\s*(-?\d{1,4}(?:\.\d+)?)\s*\]/);
  if(!match)return null;
  const x=Math.round(Number(match[1])),y=Math.round(Number(match[2]));
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1000||y<0||y>1000)return null;
  return{x,y,scale:1000};
}

export function vistaStatus(env:Bindings){
  const enabled=env.VISTA_ENABLED!=='false';
  const endpointConfigured=Boolean(env.VISTA_BASE_URL?.trim());
  const model=env.VISTA_MODEL?.trim()||VISTA_RUNTIME.model;
  const label=env.VISTA_LABEL?.trim()||VISTA_RUNTIME.label;
  return{
    id:VISTA_RUNTIME.id,
    model,
    label,
    role:VISTA_RUNTIME.role,
    parameters:VISTA_RUNTIME.parameters,
    license:VISTA_RUNTIME.license,
    enabled,
    endpointConfigured,
    mode:!enabled?'disabled':endpointConfigured?'endpoint':'pending-endpoint',
    reason:!enabled?'VISTA está desactivado':endpointConfigured?'Endpoint VISTA OpenAI-compatible configurado':'Modelo integrado; falta conectar un endpoint vLLM o SGLang con GPU'
  };
}

export async function callVistaGrounding(env:Bindings,prompt:string,dataUrl:string){
  const status=vistaStatus(env);
  if(!status.enabled)throw new Error('VISTA-9B está desactivado');
  const configured=env.VISTA_BASE_URL?.trim();
  if(!configured)throw new Error('VISTA-9B está integrado pero falta configurar VISTA_BASE_URL');
  const baseUrl=configured.replace(/\/$/,'').replace(/\/chat\/completions$/,'');
  const endpoint=baseUrl.endsWith('/v1')?`${baseUrl}/chat/completions`:`${baseUrl}/v1/chat/completions`;
  const token=env.VISTA_TOKEN?.trim();
  const configuredTimeout=Number(env.VISTA_TIMEOUT_MS);
  const timeoutMs=Number.isFinite(configuredTimeout)&&configuredTimeout>=1000?Math.min(120_000,configuredTimeout):60_000;
  const instruction=`Output the center point of the position corresponding to the instruction: ${prompt}. The output should just be the coordinates of a point, in the format [x,y].`;
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(token)headers.Authorization=`Bearer ${token}`;
  const response=await withTimeout(fetch(endpoint,{
    method:'POST',
    headers,
    body:JSON.stringify({
      model:status.model,
      messages:[{role:'user',content:[{type:'text',text:instruction},{type:'image_url',image_url:{url:dataUrl}}]}],
      temperature:0,
      max_tokens:32,
      stream:false
    })
  }),timeoutMs,'VISTA-9B excedió el tiempo permitido');
  const data=await response.json() as VistaChatResponse;
  const error=typeof data.error==='string'?data.error:data.error?.message;
  if(!response.ok)throw new Error(error||`VISTA respondió ${response.status}`);
  const text=data.choices?.[0]?.message?.content?.trim()||'';
  const coordinate=parseVistaCoordinate(text);
  if(!coordinate)throw new Error(`VISTA devolvió una coordenada inválida: ${text.slice(0,120)||'respuesta vacía'}`);
  return{
    id:data.id||`vista-${crypto.randomUUID()}`,
    text,
    coordinate,
    model:status.model,
    provider:'vista' as const,
    usage:{input_tokens:data.usage?.prompt_tokens,output_tokens:data.usage?.completion_tokens}
  };
}
