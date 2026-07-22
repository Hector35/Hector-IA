import {selectFreeResource,type FreeCapability} from './free-resource-policy';
import {chooseRuntimeReuse,type RuntimeReuseCandidate,type RuntimeReuseDecision} from './runtime-reuse';

export type InferenceTier='none'|'browser-local'|'cloudflare-free'|'economic'|'advanced';
export type GovernedExecutionPlan={
 reuse:RuntimeReuseDecision;
 capability:FreeCapability;
 inferenceTier:InferenceTier;
 maxAdvancedCalls:0|1;
 reason:string;
};

const CLASSIFICATION=/\b(clasifica|categoriza|detecta|identifica|enruta|prioriza)\b/i;
const EXTRACTION=/\b(extrae|estructura|campos|json|parsea|analiza formato)\b/i;
const SUMMARY=/\b(resume|resumen|sintetiza)\b/i;

export function inferFreeCapability(prompt:string):FreeCapability{
 if(CLASSIFICATION.test(prompt))return'classification';
 if(EXTRACTION.test(prompt))return'extraction';
 if(SUMMARY.test(prompt))return'summarization';
 return'generation';
}

export function governInference(input:{prompt:string;candidates:RuntimeReuseCandidate[];authorizedHighRisk?:boolean;allowBrowserLocal?:boolean;allowCloudflareAi?:boolean;modelCostUsd?:number}):GovernedExecutionPlan{
 const reuse=chooseRuntimeReuse(input.prompt,input.candidates,{authorizedHighRisk:input.authorizedHighRisk,modelCostUsd:input.modelCostUsd});
 const capability=inferFreeCapability(input.prompt);
 if(reuse.kind==='blocked')return{reuse,capability,inferenceTier:'none',maxAdvancedCalls:0,reason:reuse.reason};
 if(reuse.kind==='deterministic')return{reuse,capability,inferenceTier:'none',maxAdvancedCalls:0,reason:'La habilidad verificada resuelve la tarea sin inferencia.'};
 const resource=selectFreeResource({capability,allowBrowserLocal:input.allowBrowserLocal,allowCloudflareAi:input.allowCloudflareAi});
 if(resource?.tier==='deterministic')return{reuse,capability,inferenceTier:'none',maxAdvancedCalls:0,reason:`Capacidad cubierta por reglas deterministas: ${resource.id}.`};
 if(resource?.tier==='browser-local')return{reuse,capability,inferenceTier:'browser-local',maxAdvancedCalls:0,reason:`Capacidad cubierta localmente por ${resource.id}.`};
 if(resource?.tier==='cloudflare-free'&&capability!=='generation')return{reuse,capability,inferenceTier:'cloudflare-free',maxAdvancedCalls:0,reason:`Capacidad cubierta dentro del free tier por ${resource.id}.`};
 return{reuse,capability,inferenceTier:resource?.tier==='cloudflare-free'?'cloudflare-free':'advanced',maxAdvancedCalls:1,reason:reuse.kind==='assist'?'Se reutiliza contexto y se limita la parte nueva a una sola llamada avanzada.':'La tarea nueva se limita a una llamada avanzada antes de cualquier reintento.'};
}

export type CallGovernorMetrics={tasks:number;deterministic:number;freeTier:number;advancedCalls:number;advancedCallsAvoided:number;estimatedTokensSaved:number;estimatedCostUsdSaved:number};

export function summarizeGovernor(plans:GovernedExecutionPlan[],baselineAdvancedCallsPerTask=2):CallGovernorMetrics{
 const advancedCalls=plans.reduce((sum,item)=>sum+item.maxAdvancedCalls,0);
 const baseline=plans.length*Math.max(1,baselineAdvancedCallsPerTask);
 const avoided=Math.max(0,baseline-advancedCalls);
 return{tasks:plans.length,deterministic:plans.filter(item=>item.reuse.kind==='deterministic').length,freeTier:plans.filter(item=>item.maxAdvancedCalls===0&&item.reuse.kind!=='blocked'&&item.reuse.kind!=='deterministic').length,advancedCalls,advancedCallsAvoided:avoided,estimatedTokensSaved:avoided*800,estimatedCostUsdSaved:Number((avoided*.0016).toFixed(6))};
}
