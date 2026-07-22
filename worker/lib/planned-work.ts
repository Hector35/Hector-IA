import type {Bindings} from '../types';
import {applyBudgetRouting,applyFeedbackRouting,routeModel,type ResponseOptions} from './openai';
import {executePlannedContextual,estimatePlannedCost} from './planned-response';
import {loadFeedbackRoutingProfile} from './feedback-routing';
import {loadCognitiveBudget,projectCognitiveCost} from './cognitive-budget';
import {loadCloudflareHealth} from './provider-quality';
import {chooseProvider} from './providers';
import {chooseDeliberation} from './deliberation';
import {createExecutionPlan,verifyExecutionPlan,type ExecutionPlan} from './execution-plan';
import {loadRuntimeReuseCandidates,runWithRuntimeReuse,type RuntimeReuseCandidate} from './runtime-reuse';
import {decideFreeFirst,runDeterministicFreeInference} from './free-first-inference';

export type PlannedWorkInput={userId:string;prompt:string;allowWeb:boolean;reasoningLevel:'auto'|'high';context?:string;authorizedHighRisk?:boolean};

export function workResponseOptions(input:Pick<PlannedWorkInput,'userId'|'reasoningLevel'>):ResponseOptions{
 return{reasoning:input.reasoningLevel,deliberation:input.reasoningLevel==='high'?'force':'auto',userId:input.userId};
}

function forecastPasses(env:Bindings,input:string,route:ReturnType<typeof routeModel>,options:ResponseOptions):1|3{
 return chooseDeliberation(input,route.tier,options,env.HECTOR_DELIBERATION_ENABLED!=='false').mode==='ensemble'?3:1;
}

export async function prepareWorkExecutionPlan(env:Bindings,input:PlannedWorkInput):Promise<{plan:ExecutionPlan;feedback:Awaited<ReturnType<typeof loadFeedbackRoutingProfile>>;budgetDecision:unknown}> {
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

async function prepareDeterministicExecution(env:Bindings,input:PlannedWorkInput){
 const feedback=await loadFeedbackRoutingProfile(env.DB,input.userId,'utility');
 const plan=await createExecutionPlan({task:'utility',route:{model:'hector-free-rules',tier:'fast',reasoning:'low',needsWeb:false},provider:{requested:'cloudflare',reason:'Política free-first: reglas locales antes de inferencia'},cognition:{mode:'single',passes:1,reason:'La tarea es verificable sin modelo'},allowedModels:['hector-free-rules'],policySummary:'Free-first: reglas locales → Workers AI → modelo económico → modelo avanzado. Cero llamadas avanzadas para utilidades deterministas.'});
 return{plan,feedback,budgetDecision:{allowed:true,reason:'costo cero',projectedCostUsd:0}};
}

function deterministicWorkOutput(output:string,candidate:RuntimeReuseCandidate,prepared:Awaited<ReturnType<typeof prepareWorkExecutionPlan>>){
 return{id:`reuse:${candidate.id}`,text:output,usage:{input_tokens:0,output_tokens:0},searchedWeb:false,model:'hector-runtime-reuse',provider:'cloudflare' as const,requestedProvider:'cloudflare' as const,providerReason:'Procedimiento determinista local reutilizado',fallback:false,qualityScore:1,qualityAccepted:true,cognitiveMode:'single' as const,deliberationPasses:0,deliberationReason:'No fue necesaria inferencia del modelo.',modelTier:prepared.plan.route.tier,modelReason:prepared.plan.policySummary,task:prepared.plan.task,feedbackAdaptation:{sampleCount:prepared.feedback.sampleCount,preferDeep:prepared.feedback.preferDeep,avoidCloudflare:prepared.feedback.avoidCloudflare,guidanceApplied:prepared.feedback.guidance.length,reason:prepared.feedback.reason},budgetDecision:prepared.budgetDecision};
}

export async function executePlannedWork(env:Bindings,input:PlannedWorkInput){
 const freeDecision=decideFreeFirst(input.prompt,{allowWeb:input.allowWeb,reasoningHigh:input.reasoningLevel==='high'});
 const freeResult=freeDecision.tier==='deterministic'?runDeterministicFreeInference(input.prompt):null;
 if(freeResult){
  const prepared=await prepareDeterministicExecution(env,input);
  const out={id:`free:${crypto.randomUUID()}`,text:freeResult.text,usage:{input_tokens:0,output_tokens:0},searchedWeb:false,model:'hector-free-rules',provider:'cloudflare' as const,requestedProvider:'cloudflare' as const,providerReason:freeDecision.reason,fallback:false,qualityScore:freeResult.confidence,qualityAccepted:true,cognitiveMode:'single' as const,deliberationPasses:1,deliberationReason:'Clasificación, extracción o routing resuelto por reglas locales.',modelTier:'fast',modelReason:prepared.plan.policySummary,task:prepared.plan.task,feedbackAdaptation:{sampleCount:prepared.feedback.sampleCount,preferDeep:prepared.feedback.preferDeep,avoidCloudflare:prepared.feedback.avoidCloudflare,guidanceApplied:0,reason:prepared.feedback.reason},budgetDecision:prepared.budgetDecision};
  const verification=verifyExecutionPlan(prepared.plan,{model:out.model,tier:out.modelTier,provider:out.provider,requestedProvider:out.requestedProvider,cognitiveMode:out.cognitiveMode,deliberationPasses:out.deliberationPasses,fallback:false});
  return{out,plan:prepared.plan,verification,usage:{inputTokens:0,outputTokens:0,cachedInputTokens:0,costUsd:0},reuse:{kind:'deterministic' as const,candidateId:null,reusedFraction:1,modelCalls:0,reason:freeDecision.reason},freeFirst:{tier:freeDecision.tier,capability:freeDecision.capability,advancedCalls:0}};
 }
 const prepared=await prepareWorkExecutionPlan(env,input);
 const candidates=await loadRuntimeReuseCandidates(env.DB,input.userId);
 const baseContext=input.context||'Trabajo persistente ejecutado fuera del chat.';
 const executed=candidates.length?await runWithRuntimeReuse({prompt:input.prompt,candidates,authorizedHighRisk:input.authorizedHighRisk,modelCostUsd:.02,model:async reuseContext=>executePlannedContextual(env,input.prompt,[],reuseContext?`${baseContext}\n\n${reuseContext}`:baseContext,prepared.plan,{feedback:prepared.feedback,budgetDecision:prepared.budgetDecision}),deterministic:(output,candidate)=>deterministicWorkOutput(output,candidate,prepared)}):{value:await executePlannedContextual(env,input.prompt,[],baseContext,prepared.plan,{feedback:prepared.feedback,budgetDecision:prepared.budgetDecision}),decision:{kind:'escalate' as const,reason:'No había experiencias reutilizables.',risk:'low' as const,candidate:null,reusedFraction:0},modelCalls:1};
 const out=executed.value;
 const verification=verifyExecutionPlan(prepared.plan,{model:out.model,tier:out.modelTier,provider:out.provider,requestedProvider:out.requestedProvider,cognitiveMode:out.cognitiveMode,deliberationPasses:out.deliberationPasses,fallback:out.fallback});
 const usage=estimatePlannedCost(out.usage,out.model);if(out.searchedWeb)usage.costUsd+=.01;
 return{out,plan:prepared.plan,verification,usage,reuse:{kind:executed.decision.kind,candidateId:executed.decision.kind==='assist'||executed.decision.kind==='deterministic'?executed.decision.candidate.id:null,reusedFraction:executed.decision.reusedFraction,modelCalls:executed.modelCalls,reason:executed.decision.reason},freeFirst:{tier:freeDecision.tier,capability:freeDecision.capability,advancedCalls:out.provider==='openai'?1:0}};
}
