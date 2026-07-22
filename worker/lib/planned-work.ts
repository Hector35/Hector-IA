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
import {compactFreeFirstContext,createExactInferenceCacheKey,createFreeFirstPolicy,loadExactInferenceCache,normalizeFreeFirstText,recordInferenceEvent,saveExactInferenceCache,type ExactInferenceCacheEntry} from './free-first';

export type PlannedWorkInput={userId:string;prompt:string;allowWeb:boolean;reasoningLevel:'auto'|'high';context?:string;authorizedHighRisk?:boolean};

export function workResponseOptions(input:Pick<PlannedWorkInput,'userId'|'reasoningLevel'>):ResponseOptions{
 return{reasoning:input.reasoningLevel,deliberation:'auto',userId:input.userId};
}

function forecastPasses(env:Bindings,input:string,route:ReturnType<typeof routeModel>,options:ResponseOptions,maxAdvancedCalls:1|3):1|3{
 if(maxAdvancedCalls===1)return 1;
 return chooseDeliberation(input,route.tier,options,env.HECTOR_DELIBERATION_ENABLED!=='false').mode==='ensemble'?3:1;
}

export async function prepareWorkExecutionPlan(env:Bindings,input:PlannedWorkInput):Promise<{plan:ExecutionPlan;feedback:Awaited<ReturnType<typeof loadFeedbackRoutingProfile>>;budgetDecision:unknown;governor:ReturnType<typeof createFreeFirstPolicy>}>{
 const options=workResponseOptions(input);
 const base=routeModel(env,input.prompt,input.allowWeb);
 const governor=createFreeFirstPolicy({prompt:input.prompt,needsWeb:base.needsWeb,reasoningLevel:input.reasoningLevel,enabled:env.HECTOR_FREE_FIRST_ENABLED!=='false'});
 const forced=options.reasoning==='high'?{...base,model:env.OPENAI_MODEL_REASONING||base.model,tier:'deep' as const,reasoning:'high' as const,reason:'trabajo persistente con razonamiento alto solicitado'}:base;
 const feedback=await loadFeedbackRoutingProfile(env.DB,input.userId,forced.task);
 let route=applyFeedbackRouting(env,forced,feedback),budgetDecision:unknown=null,budgetSummary='sin presupuesto configurado';
 const budget=await loadCognitiveBudget(env.DB,input.userId);
 if(budget){
  const initial=projectCognitiveCost(budget,route.model,route.tier,input.prompt.length,(input.context||'').length,forecastPasses(env,input.prompt,route,options,governor.maxAdvancedCalls));
  const applied=applyBudgetRouting(env,route,input.prompt,options,budget,initial);route=applied.route;budgetDecision=applied.decision;budgetSummary=applied.decision.reason;
 }
 const enabled=env.CLOUDFLARE_AI_ENABLED!=='false';
 const health=route.tier==='fast'&&enabled?await loadCloudflareHealth(env.DB):undefined;
 const provider=chooseProvider(input.prompt,route.tier,route.needsWeb,enabled,health,feedback);
 const requestedCognition=chooseDeliberation(input.prompt,route.tier,options,env.HECTOR_DELIBERATION_ENABLED!=='false');
 const cognition=governor.maxAdvancedCalls===1&&requestedCognition.mode==='ensemble'?{...requestedCognition,mode:'single' as const,candidateCount:1 as const,reason:`Gobernador free-first: ${governor.reason}. Se conserva el nivel de razonamiento en una sola inferencia.`}:requestedCognition;
 const allowedModels=[route.model,'hector-exact-cache'];
 if(provider.provider==='cloudflare')allowedModels.push(env.CLOUDFLARE_MODEL_FAST||'@cf/meta/llama-3.1-8b-instruct-fast');
 if(cognition.mode==='ensemble')allowedModels.push(env.OPENAI_MODEL_CRITIC||route.model);
 const plan=await createExecutionPlan({task:route.task,route:{model:route.model,tier:route.tier,reasoning:route.reasoning,needsWeb:route.needsWeb},provider:{requested:provider.provider,reason:provider.reason},cognition:{mode:cognition.mode,passes:cognition.mode==='ensemble'?3:1,reason:cognition.reason},allowedModels,policySummary:`Trabajo persistente. Free-first: ${governor.reason}. Feedback: ${feedback.reason}. Presupuesto: ${budgetSummary}.`});
 return{plan,feedback,budgetDecision,governor};
}

function deterministicWorkOutput(output:string,candidate:RuntimeReuseCandidate,prepared:Awaited<ReturnType<typeof prepareWorkExecutionPlan>>){
 return{
  id:`reuse:${candidate.id}`,text:output,usage:{input_tokens:0,output_tokens:0},searchedWeb:false,
  model:'hector-runtime-reuse',provider:prepared.plan.provider.requested,requestedProvider:prepared.plan.provider.requested,
  providerReason:'Procedimiento determinista local reutilizado',fallback:false,qualityScore:1,qualityAccepted:true,
  cognitiveMode:'single' as const,deliberationPasses:0,deliberationReason:'No fue necesaria inferencia del modelo.',
  modelTier:prepared.plan.route.tier,modelReason:prepared.plan.policySummary,task:prepared.plan.task,
  feedbackAdaptation:{sampleCount:prepared.feedback.sampleCount,preferDeep:prepared.feedback.preferDeep,avoidCloudflare:prepared.feedback.avoidCloudflare,guidanceApplied:prepared.feedback.guidance.length,reason:prepared.feedback.reason},
  budgetDecision:prepared.budgetDecision
 };
}

function cachedWorkOutput(entry:ExactInferenceCacheEntry,prepared:Awaited<ReturnType<typeof prepareWorkExecutionPlan>>){
 return{
  id:`cache:${entry.cacheKey}`,text:entry.text,usage:{input_tokens:0,output_tokens:0},searchedWeb:false,
  model:'hector-exact-cache',provider:prepared.plan.provider.requested,requestedProvider:prepared.plan.provider.requested,
  providerReason:'Resultado exacto verificado recuperado de D1',fallback:false,qualityScore:1,qualityAccepted:true,
  cognitiveMode:'single' as const,deliberationPasses:0,deliberationReason:'Caché exacta; no fue necesaria inferencia.',
  modelTier:prepared.plan.route.tier,modelReason:prepared.plan.policySummary,task:prepared.plan.task,
  feedbackAdaptation:{sampleCount:prepared.feedback.sampleCount,preferDeep:prepared.feedback.preferDeep,avoidCloudflare:prepared.feedback.avoidCloudflare,guidanceApplied:prepared.feedback.guidance.length,reason:prepared.feedback.reason},
  budgetDecision:prepared.budgetDecision
 };
}

export async function executePlannedWork(env:Bindings,input:PlannedWorkInput){
 const prepared=await prepareWorkExecutionPlan(env,input),baseContext=compactFreeFirstContext(input.context||'Trabajo persistente ejecutado fuera del chat.',prepared.governor.contextCharLimit),cacheKey=await createExactInferenceCacheKey({userId:input.userId,prompt:input.prompt,context:baseContext});
 const cached=prepared.governor.cacheable?await loadExactInferenceCache(env.DB,input.userId,cacheKey):null;
 if(cached){
  const out=cachedWorkOutput(cached,prepared),verification=verifyExecutionPlan(prepared.plan,{model:out.model,tier:out.modelTier,provider:out.provider,requestedProvider:out.requestedProvider,cognitiveMode:out.cognitiveMode,deliberationPasses:out.deliberationPasses,fallback:out.fallback}),usage=estimatePlannedCost(out.usage,out.model);
  await recordInferenceEvent(env.DB,{userId:input.userId,executionId:out.id,taskKind:prepared.governor.taskKind,routeTier:prepared.plan.route.tier,requestedProvider:prepared.plan.provider.requested,actualProvider:'cache',model:out.model,modelCalls:0,advancedCalls:0,freeCalls:0,cacheHit:true,inputTokens:0,outputTokens:0,estimatedCostUsd:0,estimatedCostAvoidedUsd:Math.max(cached.estimatedCostUsd,.002),reason:prepared.governor.reason});
  return{out,plan:prepared.plan,verification,usage,reuse:{kind:'deterministic' as const,candidateId:`cache:${cacheKey}`,reusedFraction:1,modelCalls:0,reason:'Caché exacta verificada.'},freeFirst:{...prepared.governor,cacheHit:true,advancedCalls:0,freeCalls:0,estimatedCostAvoidedUsd:Math.max(cached.estimatedCostUsd,.002)}};
 }
 const candidates=await loadRuntimeReuseCandidates(env.DB,input.userId);
 const executed=candidates.length?await runWithRuntimeReuse({
  prompt:input.prompt,candidates,authorizedHighRisk:input.authorizedHighRisk,modelCostUsd:.02,
  model:async reuseContext=>executePlannedContextual(env,input.prompt,[],reuseContext?`${baseContext}\n\n${reuseContext}`:baseContext,prepared.plan,{feedback:prepared.feedback,budgetDecision:prepared.budgetDecision}),
  deterministic:(output,candidate)=>deterministicWorkOutput(output,candidate,prepared)
 }):{value:await executePlannedContextual(env,input.prompt,[],baseContext,prepared.plan,{feedback:prepared.feedback,budgetDecision:prepared.budgetDecision}),decision:{kind:'escalate' as const,reason:'No había experiencias reutilizables.',risk:'low' as const,candidate:null,reusedFraction:0},modelCalls:1};
 const out=executed.value;
 const verification=verifyExecutionPlan(prepared.plan,{model:out.model,tier:out.modelTier,provider:out.provider,requestedProvider:out.requestedProvider,cognitiveMode:out.cognitiveMode,deliberationPasses:out.deliberationPasses,fallback:out.fallback});
 const usage=estimatePlannedCost(out.usage,out.model);if(out.searchedWeb)usage.costUsd+=.01;
 const advancedCalls=out.provider==='openai'?Math.max(1,out.deliberationPasses):0,freeCalls=out.provider==='cloudflare'?Math.max(1,out.deliberationPasses):0,avoidedCalls=Math.max(0,prepared.governor.baselineAdvancedCalls-advancedCalls),unitCost=advancedCalls?usage.costUsd/advancedCalls:.02,estimatedCostAvoidedUsd=avoidedCalls*Math.max(.002,unitCost||.02);
 if(prepared.governor.cacheable&&out.qualityAccepted&&verification.ok&&!out.searchedWeb&&out.text.trim().length>=20){
  await saveExactInferenceCache(env.DB,{userId:input.userId,cacheKey,objectiveNormalized:normalizeFreeFirstText(input.prompt),text:out.text,provider:out.provider,model:out.model,verificationJson:JSON.stringify(verification),estimatedCostUsd:usage.costUsd,ttlSeconds:Number(env.HECTOR_CACHE_TTL_SECONDS)||86_400});
 }
 await recordInferenceEvent(env.DB,{userId:input.userId,executionId:out.id,taskKind:prepared.governor.taskKind,routeTier:prepared.plan.route.tier,requestedProvider:prepared.plan.provider.requested,actualProvider:out.provider,model:out.model,modelCalls:advancedCalls+freeCalls,advancedCalls,freeCalls,cacheHit:false,inputTokens:out.usage?.input_tokens||0,outputTokens:out.usage?.output_tokens||0,estimatedCostUsd:usage.costUsd,estimatedCostAvoidedUsd,reason:prepared.governor.reason});
 return{out,plan:prepared.plan,verification,usage,reuse:{kind:executed.decision.kind,candidateId:executed.decision.kind==='assist'||executed.decision.kind==='deterministic'?executed.decision.candidate.id:null,reusedFraction:executed.decision.reusedFraction,modelCalls:executed.modelCalls,reason:executed.decision.reason},freeFirst:{...prepared.governor,cacheHit:false,advancedCalls,freeCalls,estimatedCostAvoidedUsd}};
}
