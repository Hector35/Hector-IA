import {createExecutionPlan,type ExecutionPlan} from './execution-plan';

export type GovernorReuseKind='blocked'|'deterministic'|'assist'|'escalate';
export type GovernorCacheStatus='miss'|'hit'|'deduplicated'|'disabled';
export type GovernorInferenceTier='none'|'free'|'economy'|'advanced';

export type CallGovernorMetrics={
 policy:'free-first-v1';
 originalPlannedPasses:number;
 governedPlannedPasses:number;
 totalInferencePasses:number;
 freeInferencePasses:number;
 economyInferencePasses:number;
 advancedInferencePasses:number;
 callsAvoided:number;
 cacheStatus:GovernorCacheStatus;
 inferenceTier:GovernorInferenceTier;
 reuseKind:GovernorReuseKind;
 estimatedCostUsd:number;
 justification:string;
};

type CacheEntry={value:unknown;expiresAt:number};
const exactCache=new Map<string,CacheEntry>();
const inFlight=new Map<string,Promise<unknown>>();
const DEFAULT_TTL_MS=5*60_000;
const MAX_CACHE_ENTRIES=128;
const HIGH_STAKES=/\b(audita|auditor[ií]a|seguridad|producci[oó]n|migraci[oó]n|arquitectura|financier|m[eé]dic|legal|irreversible|cr[ií]tic|incidente|recuperaci[oó]n|rollback)\b/i;
const VOLATILE=/\b(hoy|ahora|actual|reciente|[uú]ltim|precio|clima|cotizaci[oó]n|estado\s+actual|en\s+vivo)\b/i;

function canonical(value:unknown):string{
 if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
 return JSON.stringify(value);
}

export async function governorRequestKey(input:{userId:string;prompt:string;context?:string;allowWeb:boolean;reasoningLevel:string}){
 const bytes=new TextEncoder().encode(canonical(input));
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

export function shouldCacheGovernorRequest(input:{prompt:string;allowWeb:boolean;risk:'low'|'medium'|'high'}){
 return input.risk==='low'&&!input.allowWeb&&!VOLATILE.test(input.prompt);
}

export function requiresIndependentPasses(prompt:string){return HIGH_STAKES.test(prompt);}

export async function applyCallGovernorPolicy(plan:ExecutionPlan,input:{prompt:string;reuseKind:GovernorReuseKind}){
 const originalPasses=plan.cognition.passes;
 const reusable=input.reuseKind==='assist'||input.reuseKind==='deterministic';
 const preserve=requiresIndependentPasses(input.prompt)&&!reusable;
 if(plan.cognition.mode==='single'||preserve){
  return{plan,originalPasses,justification:preserve?'Se conservan pasadas independientes por riesgo o necesidad de auditoría.':'El plan ya utiliza una sola inferencia.'};
 }
 const{version:_version,hash:_hash,createdAt:_createdAt,...base}=plan;
 const governed=await createExecutionPlan({...base,cognition:{mode:'single',passes:1,reason:reusable?'El contexto verificado reduce la parte novedosa a una sola pasada.':'Una sola pasada es suficiente; el gobernador evita ensamble redundante.'},policySummary:`${plan.policySummary} Gobernador free-first: máximo una pasada salvo riesgo o auditoría explícita.`});
 return{plan:governed,originalPasses,justification:governed.cognition.reason};
}

function pruneCache(now:number){
 for(const[key,item]of exactCache)if(item.expiresAt<=now)exactCache.delete(key);
 while(exactCache.size>=MAX_CACHE_ENTRIES){const oldest=exactCache.keys().next().value as string|undefined;if(!oldest)break;exactCache.delete(oldest);}
}

export async function runGovernedExecution<T>(input:{key:string;cacheable:boolean;deduplicate?:boolean;ttlMs?:number;now?:()=>number;execute:()=>Promise<T>;isCacheableResult?:(value:T)=>boolean}):Promise<{value:T;cacheStatus:GovernorCacheStatus}>{
 const now=input.now?.()??Date.now();pruneCache(now);
 if(input.cacheable){
  const cached=exactCache.get(input.key);
  if(cached&&cached.expiresAt>now)return{value:cached.value as T,cacheStatus:'hit'};
 }
 if(input.deduplicate!==false){
  const pending=inFlight.get(input.key);
  if(pending)return{value:await pending as T,cacheStatus:'deduplicated'};
 }
 const promise=input.execute();
 if(input.deduplicate!==false)inFlight.set(input.key,promise as Promise<unknown>);
 try{
  const value=await promise;
  if(input.cacheable&&(input.isCacheableResult?.(value)??true)){
   pruneCache(now);exactCache.set(input.key,{value,expiresAt:now+Math.max(1,input.ttlMs??DEFAULT_TTL_MS)});
  }
  return{value,cacheStatus:input.cacheable?'miss':'disabled'};
 }finally{
  if(inFlight.get(input.key)===promise)inFlight.delete(input.key);
 }
}

export function inferenceTier(plan:ExecutionPlan,provider:string,passes:number):GovernorInferenceTier{
 if(passes<=0)return'none';
 if(provider==='cloudflare')return'free';
 if(plan.route.tier==='deep'||plan.route.reasoning==='high')return'advanced';
 return'economy';
}

export function buildCallGovernorMetrics(input:{plan:ExecutionPlan;originalPlannedPasses:number;reuseKind:GovernorReuseKind;provider:string;actualPasses:number;cacheStatus:GovernorCacheStatus;estimatedCostUsd:number;justification:string}):CallGovernorMetrics{
 const actual=input.cacheStatus==='hit'||input.cacheStatus==='deduplicated'?0:Math.max(0,Math.trunc(input.actualPasses));
 const tier=inferenceTier(input.plan,input.provider,actual);
 const avoided=Math.max(0,input.originalPlannedPasses-actual);
 return{
  policy:'free-first-v1',originalPlannedPasses:input.originalPlannedPasses,governedPlannedPasses:input.plan.cognition.passes,totalInferencePasses:actual,
  freeInferencePasses:tier==='free'?actual:0,economyInferencePasses:tier==='economy'?actual:0,advancedInferencePasses:tier==='advanced'?actual:0,
  callsAvoided:avoided,cacheStatus:input.cacheStatus,inferenceTier:tier,reuseKind:input.reuseKind,estimatedCostUsd:input.cacheStatus==='hit'||input.cacheStatus==='deduplicated'?0:Math.max(0,input.estimatedCostUsd),justification:input.justification
 };
}

export function resetCallGovernorState(){exactCache.clear();inFlight.clear();}
