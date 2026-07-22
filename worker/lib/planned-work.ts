import type {Bindings} from '../types';
import {applyBudgetRouting,applyFeedbackRouting,routeModel,type ResponseOptions} from './openai';
import {executePlannedContextual,estimatePlannedCost} from './planned-response';
import {loadFeedbackRoutingProfile} from './feedback-routing';
import {loadCognitiveBudget,projectCognitiveCost} from './cognitive-budget';
import {loadCloudflareHealth} from './provider-quality';
import {chooseProvider} from './providers';
import {chooseDeliberation} from './deliberation';
import {createExecutionPlan,verifyExecutionPlan,type ExecutionPlan} from './execution-plan';

export type PlannedWorkInput={userId:string;prompt:string;allowWeb:boolean;reasoningLevel:'auto'|'high';context?:string};

function forecastPasses(env:Bindings,input:string,route:ReturnType<typeof routeModel>,options:ResponseOptions):1|3{
 return chooseDeliberation(input,route.tier,options,env.HECTOR_DELIBERATION_ENABLED!=='false').mode==='ensemble'?3:1;
}

export async function prepareWorkExecutionPlan(env:Bindings,input:PlannedWorkInput):Promise<{plan:ExecutionPlan;feedback:Awaited<ReturnType<typeof loadFeedbackRoutingProfile>>;budgetDecision:unknown}>{
 const options:ResponseOptions={reasoning:input.reasoningLevel,deliberation:input.reasoningLevel==='high'?'force':'auto',userId:input.userId};
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

export async function executePlannedWork(env:Bindings,input:PlannedWorkInput){
 const prepared=await prepareWorkExecutionPlan(env,input);
 const out=await executePlannedContextual(env,input.prompt,[],input.context||'Trabajo persistente ejecutado fuera del chat.',prepared.plan,{feedback:prepared.feedback,budgetDecision:prepared.budgetDecision});
 const verification=verifyExecutionPlan(prepared.plan,{model:out.model,tier:out.modelTier,provider:out.provider,requestedProvider:out.requestedProvider,cognitiveMode:out.cognitiveMode,deliberationPasses:out.deliberationPasses,fallback:out.fallback});
 const usage=estimatePlannedCost(out.usage,out.model);if(out.searchedWeb)usage.costUsd+=.01;
 return{out,plan:prepared.plan,verification,usage};
}
