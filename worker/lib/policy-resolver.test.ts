import {describe,expect,it} from 'vitest';
import {evaluateCognitiveBudget,projectCognitiveCost} from './cognitive-budget';
import {resolveBudgetPolicy,resolvePreBudgetPolicy,type PolicyRoute} from './policy-resolver';
import type {FeedbackRoutingProfile} from './feedback-routing';
import type {BenchmarkPolicy} from './benchmark-promotion';
import type {DriftCause} from './plan-drift-incidents';

const models={fast:'luna',balanced:'terra',deep:'sol'};
const base=(task='consulta general'):PolicyRoute=>({model:'terra',tier:'balanced',reason:'consulta general con análisis',reasoning:'medium',task,needsWeb:false});
const feedback=(overrides:Partial<FeedbackRoutingProfile>={}):FeedbackRoutingProfile=>({sampleCount:0,negativeRate:0,nonDeepSampleCount:0,nonDeepNegativeRate:0,cloudflareSampleCount:0,cloudflareNegativeRate:0,preferDeep:false,avoidCloudflare:false,guidance:[],reason:'sin evidencia suficiente',...overrides});
const containment=(cause:DriftCause,status:'contained'|'probe-ready'='contained')=>({cause,status,incidents:3,active:2,recovered:0,retryFailed:1,firstSeenAt:'2026-07-21T20:00:00.000Z',lastSeenAt:'2026-07-21T22:00:00.000Z',nextProbeAt:'2026-07-22T04:00:00.000Z',reason:'desviaciones repetidas'});
const benchmark=(overrides:Partial<BenchmarkPolicy>={}):BenchmarkPolicy=>({strategy:'adaptive',status:'promoted',sampleCount:8,adaptiveWinRate:.75,averageScoreDelta:3,averageCostMultiplier:2,reason:'ventaja repetida',...overrides});
const budget=(mode:'observe'|'protect'='protect')=>evaluateCognitiveBudget({dailyLimitUsd:1,monthlyLimitUsd:10,warnPercent:80,enforcementMode:mode},{todayUsd:1,monthUsd:1});

describe('unified policy resolver',()=>{
 it('da precedencia al control manual sobre la promoción automática',()=>{
  const decision=resolvePreBudgetPolicy({baseRoute:base(),models,options:{deliberation:'off'},benchmark:benchmark(),feedback:feedback()});
  expect(decision.benchmarkApplied).toBe(false);
  expect(decision.route.tier).toBe('balanced');
  expect(decision.evidence.some(x=>x.source==='benchmark'&&x.outcome==='ignored')).toBe(true);
 });

 it('convierte una promoción válida en razonamiento profundo y ensemble protegido',()=>{
  const pre=resolvePreBudgetPolicy({baseRoute:base(),models,options:{},benchmark:benchmark(),feedback:feedback()});
  const projection=projectCognitiveCost(budget(),pre.route.model,pre.route.tier,100,100,3);
  const final=resolveBudgetPolicy({decision:pre,models,budget:budget(),projection,inputText:'explica esto'});
  expect(final.benchmarkApplied).toBe(true);
  expect(final.options).toMatchObject({reasoning:'high',deliberation:'force'});
  expect(final.route.tier).toBe('deep');
  expect(final.evidence.some(x=>x.source==='budget'&&x.outcome==='protected')).toBe(true);
 });

 it('permite al presupuesto degradar una elevación aprendida que no está protegida',()=>{
  const pre=resolvePreBudgetPolicy({baseRoute:base(),models,options:{},benchmark:null,feedback:feedback({preferDeep:true,reason:'fallos repetidos'})});
  const projection=projectCognitiveCost(budget(),pre.route.model,pre.route.tier,100,100,3);
  const final=resolveBudgetPolicy({decision:pre,models,budget:budget(),projection,inputText:'explica esto'});
  expect(pre.route.tier).toBe('deep');
  expect(final.route.tier).toBe('balanced');
  expect(final.summary).toContain('Ruta final balanced');
 });

 it('nunca degrada salud aunque el presupuesto esté excedido',()=>{
  const pre=resolvePreBudgetPolicy({baseRoute:base('salud y análisis de riesgo'),models,options:{},benchmark:null,feedback:feedback()});
  const projection=projectCognitiveCost(budget(),pre.route.model,pre.route.tier,100,100,1);
  const final=resolveBudgetPolicy({decision:pre,models,budget:budget(),projection,inputText:'tengo dolor y taquicardia'});
  expect(final.route.tier).toBe('balanced');
  expect(final.evidence.some(x=>x.source==='budget'&&x.outcome==='protected')).toBe(true);
 });

 it('en observación registra la decisión sin modificar la ruta',()=>{
  const pre=resolvePreBudgetPolicy({baseRoute:base(),models,options:{},benchmark:null,feedback:feedback()});
  const projection=projectCognitiveCost(budget('observe'),pre.route.model,pre.route.tier,100,100,1);
  const final=resolveBudgetPolicy({decision:pre,models,budget:budget('observe'),projection,inputText:'hola'});
  expect(final.route).toEqual(pre.route);
  expect(final.budgetDecision?.action).toBe('allow');
 });

 it('contiene router sin activar ensemble genérico',()=>{
  const decision=resolvePreBudgetPolicy({baseRoute:base(),models,options:{},benchmark:benchmark({driftContainment:[containment('router')]}),feedback:feedback()});
  expect(decision.route.tier).toBe('deep');
  expect(decision.options.deliberation).not.toBe('force');
  expect(decision.containedCauses).toEqual(['router']);
 });

 it('contiene cognición desactivando deliberación múltiple',()=>{
  const decision=resolvePreBudgetPolicy({baseRoute:base(),models,options:{},benchmark:benchmark({driftContainment:[containment('cognition')]}),feedback:feedback()});
  expect(decision.options.deliberation).toBe('off');
  expect(decision.route.tier).toBe('balanced');
 });

 it('suspende degradación de presupuesto sin cambiar el modelo',()=>{
  const pre=resolvePreBudgetPolicy({baseRoute:base(),models,options:{},benchmark:benchmark({driftContainment:[containment('budget')]}),feedback:feedback()});
  const projection=projectCognitiveCost(budget(),pre.route.model,pre.route.tier,100,100,1),final=resolveBudgetPolicy({decision:pre,models,budget:budget(),projection,inputText:'explica esto'});
  expect(final.route).toEqual(pre.route);
  expect(final.budgetDecision).toBeNull();
  expect(final.evidence.some(x=>x.source==='budget'&&x.outcome==='protected')).toBe(true);
 });

 it('ignora adaptación aprendida mientras feedback está contenido',()=>{
  const decision=resolvePreBudgetPolicy({baseRoute:base(),models,options:{},benchmark:benchmark({driftContainment:[containment('feedback')]}),feedback:feedback({preferDeep:true,reason:'fallos repetidos'})});
  expect(decision.route.tier).toBe('balanced');
  expect(decision.feedbackApplied).toBe(false);
 });

 it('respeta control manual incluso durante contención',()=>{
  const decision=resolvePreBudgetPolicy({baseRoute:base(),models,options:{deliberation:'force'},benchmark:benchmark({driftContainment:[containment('cognition')]}),feedback:feedback()});
  expect(decision.containedCauses).toEqual(['cognition']);
  expect(decision.options.deliberation).toBe('force');
 });
});