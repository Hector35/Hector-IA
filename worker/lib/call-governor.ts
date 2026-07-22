import {createExecutionPlan,type ExecutionPlan} from './execution-plan';

export type ReuseDisposition='deterministic'|'assist'|'escalate';
export type CallGovernorDecision={
 maxAdvancedCalls:0|1|3;
 requestedPasses:1|3;
 allowedPasses:1|3;
 justification:string;
 estimatedAdvancedCallsSaved:number;
};

export type CallGovernorMetrics={
 advancedCalls:number;
 deduplicatedCalls:number;
 blockedCalls:number;
 requestedPasses:number;
 executedPasses:number;
 estimatedAdvancedCallsSaved:number;
 justifications:string[];
};

const MULTI_PASS=/\b(compara|evalua|audita|arquitectura|estrategia|migracion|seguridad|riesgo|contradiccion|investiga|diagnostica|causa raiz|trade[- ]?off)\b/i;
const SIMPLE=/\b(clasifica|extrae|formatea|resume|convierte|valida|verifica|lista|normaliza|parsea|busca|encuentra)\b/i;
const SHARED_INFLIGHT=new Map<string,Promise<unknown>>();

export function decideCallBudget(input:{prompt:string;reuse:ReuseDisposition;requestedPasses:1|3;reasoningLevel:'auto'|'high'}):CallGovernorDecision{
 const prompt=input.prompt.trim();
 if(input.reuse==='deterministic')return{maxAdvancedCalls:0,requestedPasses:input.requestedPasses,allowedPasses:1,justification:'La salida fue resuelta por un procedimiento determinista verificado; una inferencia avanzada sería redundante.',estimatedAdvancedCallsSaved:input.requestedPasses};
 if(input.reuse==='assist')return{maxAdvancedCalls:1,requestedPasses:input.requestedPasses,allowedPasses:1,justification:'Existe contexto verificado reutilizable; una sola inferencia debe resolver únicamente la parte nueva.',estimatedAdvancedCallsSaved:Math.max(0,input.requestedPasses-1)};
 const needsMultiple=input.reasoningLevel==='high'&&MULTI_PASS.test(prompt)&&!SIMPLE.test(prompt)&&prompt.length>=120;
 if(needsMultiple)return{maxAdvancedCalls:3,requestedPasses:input.requestedPasses,allowedPasses:input.requestedPasses,justification:'La tarea nueva combina análisis amplio, riesgo o comparación y conserva deliberación múltiple.',estimatedAdvancedCallsSaved:0};
 return{maxAdvancedCalls:1,requestedPasses:input.requestedPasses,allowedPasses:1,justification:'La tarea puede resolverse con una sola inferencia avanzada; se bloquean pasadas adicionales sin evidencia de necesidad.',estimatedAdvancedCallsSaved:Math.max(0,input.requestedPasses-1)};
}

export async function governExecutionPlan(plan:ExecutionPlan,input:{prompt:string;reuse:ReuseDisposition;reasoningLevel:'auto'|'high'}){
 const decision=decideCallBudget({prompt:input.prompt,reuse:input.reuse,requestedPasses:plan.cognition.passes,reasoningLevel:input.reasoningLevel});
 if(decision.allowedPasses===plan.cognition.passes)return{plan,decision};
 const governed=await createExecutionPlan({
  task:plan.task,
  route:plan.route,
  provider:plan.provider,
  cognition:{mode:'single',passes:1,reason:`Call governor: ${decision.justification}`},
  allowedModels:plan.allowedModels,
  policySummary:`${plan.policySummary} Call governor: ${decision.justification}`
 });
 return{plan:governed,decision};
}

async function stableKey(value:string){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return[...new Uint8Array(digest)].map(item=>item.toString(16).padStart(2,'0')).join('');
}

export function createCallGovernor(decision:CallGovernorDecision){
 const metrics:CallGovernorMetrics={advancedCalls:0,deduplicatedCalls:0,blockedCalls:0,requestedPasses:decision.requestedPasses,executedPasses:0,estimatedAdvancedCallsSaved:decision.estimatedAdvancedCallsSaved,justifications:[decision.justification]};
 return{
  metrics,
  async advanced<T>(input:{key:string;justification:string;execute:()=>Promise<T>}):Promise<T>{
   const key=await stableKey(input.key);
   const existing=SHARED_INFLIGHT.get(key) as Promise<T>|undefined;
   if(existing){metrics.deduplicatedCalls++;metrics.estimatedAdvancedCallsSaved+=decision.allowedPasses;metrics.justifications.push(`Inferencia en vuelo reutilizada: ${input.justification}`);return existing;}
   if(metrics.advancedCalls>=decision.maxAdvancedCalls){metrics.blockedCalls++;throw new Error(`Call governor bloqueó una inferencia avanzada redundante: ${input.justification}`);}
   metrics.advancedCalls++;metrics.executedPasses+=decision.allowedPasses;metrics.justifications.push(input.justification);
   const pending=input.execute().finally(()=>SHARED_INFLIGHT.delete(key));
   SHARED_INFLIGHT.set(key,pending);
   return pending;
  }
 };
}

export function resetCallGovernorState(){SHARED_INFLIGHT.clear();}

export function benchmarkCallReduction(){
 const scenarios=[
  {name:'conocida',before:3,decision:decideCallBudget({prompt:'ejecuta validacion conocida',reuse:'deterministic',requestedPasses:3,reasoningLevel:'high'})},
  {name:'parcial',before:3,decision:decideCallBudget({prompt:'corrige la parte nueva usando el procedimiento verificado',reuse:'assist',requestedPasses:3,reasoningLevel:'high'})},
  {name:'nueva-simple',before:3,decision:decideCallBudget({prompt:'valida y normaliza estos datos',reuse:'escalate',requestedPasses:3,reasoningLevel:'high'})},
  {name:'nueva-compleja',before:3,decision:decideCallBudget({prompt:'Audita la arquitectura completa, compara alternativas, diagnostica riesgos de seguridad y documenta trade-offs antes de una migracion irreversible con múltiples dependencias.',reuse:'escalate',requestedPasses:3,reasoningLevel:'high'})}
 ];
 return scenarios.map(item=>({name:item.name,beforeAdvancedCalls:item.before,afterAdvancedCalls:item.decision.maxAdvancedCalls,savedAdvancedCalls:item.before-item.decision.maxAdvancedCalls,successGuard:item.decision.maxAdvancedCalls>0||item.name==='conocida'}));
}
