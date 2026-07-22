import {describe,expect,it,vi} from 'vitest';
import {applyMetacognitiveControl,metacognitiveBenchmark,metacognitiveStrategyKey,recommendMetacognitiveControl,recordMetacognitiveOutcome,summarizeMetacognitiveProfiles,type MetacognitiveOutcomeRow,type MetacognitiveStrategy} from './metacognitive-control';

const feedback={sampleCount:10,negativeRate:.2,nonDeepSampleCount:6,nonDeepNegativeRate:.2,cloudflareSampleCount:4,cloudflareNegativeRate:.2,preferDeep:false,avoidCloudflare:false,guidance:[],reason:'calidad estable'};
const row=(strategy:MetacognitiveStrategy,success:boolean,overrides:Partial<MetacognitiveOutcomeRow>={}):MetacognitiveOutcomeRow=>({strategy_key:metacognitiveStrategyKey(strategy),route_tier:strategy.routeTier,provider:strategy.provider,cognitive_mode:strategy.cognitiveMode,predicted_success:.8,observed_success:success?1:0,quality_score:success?90:20,fallback:0,advanced_calls:strategy.cognitiveMode==='ensemble'?3:1,cost_usd:strategy.provider==='openai'?.02:0,duration_ms:1000,...overrides});
const current=(overrides:any={})=>({route:{model:'deep',tier:'deep' as const,reason:'test',reasoning:'high' as const,task:'planificación',needsWeb:false},provider:{provider:'openai' as const,reason:'test'},cognition:{mode:'ensemble' as const,reason:'test',candidateCount:2 as const,highStakes:false},...overrides});

describe('metacognitive control',()=>{
 it('calibra éxito con posterior beta y penaliza sobreconfianza',()=>{
  const strategy={routeTier:'balanced',provider:'openai',cognitiveMode:'single'} as const,profiles=summarizeMetacognitiveProfiles([row(strategy,true,{predicted_success:.95}),row(strategy,false,{predicted_success:.95}),row(strategy,true,{predicted_success:.95})]);
  expect(profiles[0]).toMatchObject({sampleCount:3,successes:2,failures:1});
  expect(profiles[0].posteriorMean).toBeCloseTo(.6,5);
  expect(profiles[0].brierScore).toBeGreaterThan(.25);
 });

 it('conserva una estrategia barata cuando su límite inferior está probado',()=>{
  const cheap={routeTier:'fast',provider:'cloudflare',cognitiveMode:'single'} as const,rows=Array.from({length:20},(_,i)=>row(cheap,i<19,{advanced_calls:0,cost_usd:0})),profiles=summarizeMetacognitiveProfiles(rows),decision=recommendMetacognitiveControl({...current(),profiles,risk:'low',reasoningLevel:'auto',feedback});
  expect(decision).toMatchObject({action:'conserve',selectedStrategy:'fast:cloudflare:single'});
  expect(decision.expectedBenefit).toBeGreaterThan(0);
 });

 it('no degrada razonamiento alto explícito a una ruta no profunda',()=>{
  const cheap={routeTier:'fast',provider:'cloudflare',cognitiveMode:'single'} as const,profiles=summarizeMetacognitiveProfiles(Array.from({length:20},()=>row(cheap,true,{advanced_calls:0,cost_usd:0}))),decision=recommendMetacognitiveControl({...current(),profiles,risk:'low',reasoningLevel:'high',feedback});
  expect(decision.selectedStrategy).toBe('deep:openai:ensemble');
  expect(decision.action).not.toBe('conserve');
 });

 it('escala una estrategia con fallos repetidos hacia evidencia más fuerte',()=>{
  const weak={routeTier:'fast',provider:'cloudflare',cognitiveMode:'single'} as const,strong={routeTier:'deep',provider:'openai',cognitiveMode:'single'} as const,profiles=summarizeMetacognitiveProfiles([...Array.from({length:8},(_,i)=>row(weak,i===0)),...Array.from({length:8},(_,i)=>row(strong,i<7))]),decision=recommendMetacognitiveControl({route:{model:'fast',tier:'fast',reason:'test',reasoning:'low',task:'código',needsWeb:false},provider:{provider:'cloudflare',reason:'test'},cognition:{mode:'single',reason:'test',candidateCount:1,highStakes:false},profiles,risk:'low',reasoningLevel:'auto',feedback});
  expect(decision).toMatchObject({action:'escalate',selectedStrategy:'deep:openai:single',requiresVerification:true});
 });

 it('aplica la estrategia sin cambiar tarea ni necesidad de web',()=>{
  const base=current({route:{model:'fast',tier:'fast',reason:'test',reasoning:'low',task:'código',needsWeb:false},provider:{provider:'cloudflare',reason:'test'},cognition:{mode:'single',reason:'test',candidateCount:1,highStakes:false}}),adjusted=applyMetacognitiveControl({OPENAI_MODEL:'base',OPENAI_MODEL_REASONING:'reasoner'},base,{version:'1.0.0',action:'escalate',currentStrategy:'fast:cloudflare:single',selectedStrategy:'deep:openai:single',predictedSuccess:.85,lowerBound:.7,uncertainty:.1,sampleCount:8,expectedBenefit:.3,requiresVerification:true,reason:'fallos repetidos'});
  expect(adjusted.route).toMatchObject({tier:'deep',model:'reasoner',task:'código',needsWeb:false});
  expect(adjusted.provider.provider).toBe('openai');
 });

 it('registra solo métricas aisladas por usuario y no contenido',async()=>{
  const run=vi.fn(async()=>({success:true})),bind=vi.fn(()=>({run})),prepare=vi.fn(()=>({bind})),db={prepare} as any,strategy={routeTier:'fast',provider:'cloudflare',cognitiveMode:'single'} as const,decision={version:'1.0.0',action:'monitor',currentStrategy:'fast:cloudflare:single',selectedStrategy:'fast:cloudflare:single',predictedSuccess:.8,lowerBound:.6,uncertainty:.1,sampleCount:3,expectedBenefit:0,requiresVerification:false,reason:'estable'} as const;
  await recordMetacognitiveOutcome(db,{userId:'user-1',task:'clasificación',strategy,plannedStrategy:decision.selectedStrategy,predictedSuccess:.8,observedSuccess:true,verificationOk:true,qualityScore:92,fallback:false,advancedCalls:0,inputTokens:0,outputTokens:0,costUsd:0,durationMs:20,decision});
  const sql=prepare.mock.calls[0][0],values=bind.mock.calls[0];
  expect(sql).toContain('metacognitive_outcomes');
  expect(values).toContain('user-1');
  expect(values.join(' ')).not.toContain('prompt secreto');
  expect(run).toHaveBeenCalledOnce();
 });

 it('demuestra ahorro y reducción de fallos confiados',()=>{
  expect(metacognitiveBenchmark()).toMatchObject({conserveAction:'conserve',escalateAction:'escalate',confidentFailuresBefore:1,confidentFailuresAfter:0});
  expect(metacognitiveBenchmark().advancedCallsAvoided).toBeGreaterThan(0);
 });
});
