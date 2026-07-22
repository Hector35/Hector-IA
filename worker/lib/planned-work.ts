import type {Bindings} from '../types';
import {applyBudgetRouting,applyFeedbackRouting,routeModel,type ResponseOptions} from './openai';
import {executePlannedContextual,estimatePlannedCost} from './planned-response';
import {loadFeedbackRoutingProfile} from './feedback-routing';
import {loadCognitiveBudget,projectCognitiveCost} from './cognitive-budget';
import {loadCloudflareHealth} from './provider-quality';
import {chooseProvider} from './providers';
import {chooseDeliberation} from './deliberation';
import {createExecutionPlan,verifyExecutionPlan,type ExecutionPlan} from './execution-plan';
import {chooseRuntimeReuse,classifyReuseRisk,loadRuntimeReuseCandidates,runWithRuntimeReuse,type RuntimeReuseCandidate} from './runtime-reuse';
import {applyCallGovernorPolicy,buildCallGovernorMetrics,governorRequestKey,runGovernedExecution,shouldCacheGovernorRequest} from './call-governor';
import {recordCallGovernorEvent} from './call-governor-ledger';

export type PlannedWorkInput={userId:string;prompt:string;allowWeb:boolean;reasoningLevel:'auto'|'high';context?:string;authorizedHighRisk?:boolean};

export function workResponseOptions(input:Pick<PlannedWorkInput,'userId'|'reasoningLevel'>):ResponseOptions{
 return{reasoning:input.reasoningLevel,deliberation:input.reasoningLevel==='high'?'force':'auto',userId:input.userId};
}

function forecastPasses(env:Bindings,input:string,route:ReturnType<typeof routeModel>,options:ResponseOptions):1|3{
 return chooseDeliberation(input,route.tier,options,env.HECTOR_DELIBERATION_ENABLED!=='false').mode==='ensemble'?3:1;
}

export async function prepareWorkExecutionPlan(env:Bindings,input:PlannedWorkInput):Promise<{plan:ExecutionPlan;feedback:Awaited<ReturnType<typeof loadFeedbackRoutingProfile>>;budgetDecision:unknown}>{
 const options=workResponseOptions(input);
 const base=routeModel(env,input.prompt,input.allowWeb);
 const forced=options.reasoning==='high'?{...base,model:env.OPENAI_MODEL_REASONING||base.model,tier:'deep' as const,reasoning:'high' as const,reason:'trabajo persistente con razonamiento alto solicitado'}:base;
 const feedback=await loadFeedbackRoutingProfile(env.DB,input.userId,forced.task);
 let route=applyFeedbackRouting(env,forced,feedback),budgetDecision:unknown=null,budgetSummary='sin presupuesto configurado';
 const budget=await loadCognitiveBudget(env.DB,input.userId);
 if(budget){
  const initial=projectCognitiveCost(budget,route.model,route.tier,input.prompt.length,(input.context||'').length,forecastPasses(env,input.prompt,route,options));
  const applied=applyBudgetRouting(env,route,input.prompt,options,budget,initial);route=applied.route;budgetDecision=applied.decision;budgetSummary=applied.decision.reason;
 }
 const enabled=env.CLOUDFLARE_AI_ENABLED!=='false';
 const health=route.tier==='fast'&&enabled?await loadCloudflareHealth(env.DB):undefined;
 const provider=chooseProvider(input.prompt,route.tier,route.needsWeb,enabled,health,feedback);
 const cognition=chooseDeliberation(input.prompt,route.tier,options,env.HECTOR_DELIBERATION_ENABLED!=='false');
 const allowedModels=[route.model];
 if(provider.provider==='cloudflare')allowedModels.push(env.CLOUDFLARE_MODEL_FAST||'@cf/meta/llama-3.1-8b-instruct-fast');
 if(cognition.mode==='ensemble')allowedModels.push(env.OPENAI_MODEL_CRITIC||route.model);
 const plan=await createExecutionPlan({task:route.task,route:{model:route.model,tier:route.tier,reasoning:route.reasoning,needsWeb:route.needsWeb},provider:{requested:provider.provider,reason:provider.reason},cognition:{mode:cognition.mode,passes:cognition.mode==='ensemble'?3:1,reason:cognition.reason},allowedModels,policySummary:`Trabajo persistente. Feedback: ${feedback.reason}. Presupuesto: ${budgetSummary}.`});
 return{plan,feedback,budgetDecision};
}

function deterministicWorkOutput(output:string,candidate:RuntimeReuseCandidate,prepared:Awaited<ReturnType<typeof prepareWorkExecutionPlan>>){
 return{
  id:`reuse:${candidate.id}`,text:output,usage:{input_tokens:0,output_tokens:0},searchedWeb:false,
  model:'hector-runtime-reuse',provider:'cloudflare' as const,requestedProvider:'cloudflare' as const,
  providerReason:'Procedimiento determinista local reutilizado',fallback:false,qualityScore:1,qualityAccepted:true,
  cognitiveMode:'single' as const,deliberationPasses:0,deliberationReason:'No fue necesaria inferencia del modelo.',
  modelTier:prepared.plan.route.tier,modelReason:prepared.plan.policySummary,task:prepared.plan.task,
  feedbackAdaptation:{sampleCount:prepared.feedback.sampleCount,preferDeep:prepared.feedback.preferDeep,avoidCloudflare:prepared.feedback.avoidCloudflare,guidanceApplied:prepared.feedback.guidance.length,reason:prepared.feedback.reason},
  budgetDecision:prepared.budgetDecision
 };
}

async function executePlannedWorkUncached(env:Bindings,input:PlannedWorkInput){
 const prepared=await prepareWorkExecutionPlan(env,input);
 const candidates=await loadRuntimeReuseCandidates(env.DB,input.userId);
 const preview=chooseRuntimeReuse(input.prompt,candidates,{authorizedHighRisk:input.authorizedHighRisk,modelCostUsd:.02});
 const policy=await applyCallGovernorPolicy(prepared.plan,{prompt:input.prompt,reuseKind:preview.kind});
 const activePrepared={...prepared,plan:policy.plan};
 const baseContext=input.context||'Trabajo persistente ejecutado fuera del chat.';
 const executed=candidates.length?await runWithRuntimeReuse({
  prompt:input.prompt,candidates,authorizedHighRisk:input.authorizedHighRisk,modelCostUsd:.02,
  model:async reuseContext=>executePlannedContextual(env,input.prompt,[],reuseContext?`${baseContext}\n\n${reuseContext}`:baseContext,activePrepared.plan,{feedback:activePrepared.feedback,budgetDecision:activePrepared.budgetDecision}),
  deterministic:(output,candidate)=>deterministicWorkOutput(output,candidate,activePrepared)
 }):{value:await executePlannedContextual(env,input.prompt,[],baseContext,activePrepared.plan,{feedback:activePrepared.feedback,budgetDecision:activePrepared.budgetDecision}),decision:{kind:'escalate' as const,reason:'No había experiencias reutilizables.',risk:'low' as const,candidate:null,reusedFraction:0},modelCalls:1};
 const out=executed.value;
 const verification=verifyExecutionPlan(activePrepared.plan,{model:out.model,tier:out.modelTier,provider:out.provider,requestedProvider:out.requestedProvider,cognitiveMode:out.cognitiveMode,deliberationPasses:out.deliberationPasses,fallback:out.fallback});
 const usage=estimatePlannedCost(out.usage,out.model);if(out.searchedWeb)usage.costUsd+=.01;
 const reuse={kind:executed.decision.kind,candidateId:executed.decision.kind==='assist'||executed.decision.kind==='deterministic'?executed.decision.candidate.id:null,reusedFraction:executed.decision.reusedFraction,modelCalls:executed.modelCalls,reason:executed.decision.reason};
 const governor=buildCallGovernorMetrics({plan:activePrepared.plan,originalPlannedPasses:policy.originalPasses,reuseKind:reuse.kind,provider:out.provider,actualPasses:out.deliberationPasses,cacheStatus:'miss',estimatedCostUsd:usage.costUsd,justification:policy.justification});
 return{out,plan:activePrepared.plan,verification,usage,reuse,governor};
}

export async function executePlannedWork(env:Bindings,input:PlannedWorkInput){
 const requestKey=await governorRequestKey({userId:input.userId,prompt:input.prompt,context:input.context,allowWeb:input.allowWeb,reasoningLevel:input.reasoningLevel});
 const risk=classifyReuseRisk(input.prompt);
 const governed=await runGovernedExecution({
  key:requestKey,cacheable:shouldCacheGovernorRequest({prompt:input.prompt,allowWeb:input.allowWeb,risk}),deduplicate:risk!=='high',
  execute:()=>executePlannedWorkUncached(env,input),
  isCacheableResult:value=>value.verification.ok&&value.out.qualityAccepted!==false&&!value.out.searchedWeb
 });
 const value=governed.value;
 const governor=governed.cacheStatus==='miss'||governed.cacheStatus==='disabled'?value.governor:buildCallGovernorMetrics({
  plan:value.plan,originalPlannedPasses:value.governor.originalPlannedPasses,reuseKind:value.reuse.kind,provider:value.out.provider,actualPasses:value.out.deliberationPasses,cacheStatus:governed.cacheStatus,estimatedCostUsd:value.usage.costUsd,justification:`${value.governor.justification} Respuesta exacta reutilizada por el gobernador.`
 });
 await recordCallGovernorEvent(env.DB,{userId:input.userId,requestKey,metrics:governor});
 return{...value,governor};
}
