import {describe,expect,it} from 'vitest';
import {baselinePlanner,cognitivePlanner,scorePlan,comparePlanners} from '../model/hector-asi/candidates/cognitive-plan-v1.mjs';

const tasks=[
  {id:'conflict',objective:'Evitar duplicación',constraints:['no esperar'],intendedFiles:['a.ts'],concurrentFiles:['a.ts'],risk:'medium',deterministic:false},
  {id:'deterministic',objective:'Contar etiquetas',constraints:['cero llamadas'],intendedFiles:[],concurrentFiles:[],risk:'low',deterministic:true},
  {id:'high-risk',objective:'Migrar datos',constraints:['rollback'],intendedFiles:['migration.sql'],concurrentFiles:[],risk:'high',deterministic:false}
];

describe('Hector ASI cognitive planner candidate',()=>{
  it('beats the cheap generic baseline on planning gates',()=>{
    const report=comparePlanners(tasks);
    expect(report.candidateMean).toBeGreaterThan(report.baselineMean);
    expect(report.candidateMean).toBe(1);
  });

  it('avoids occupied files and produces a reusable handoff',()=>{
    const plan=cognitivePlanner(tasks[0]);
    expect(plan.conflicts).toEqual(['a.ts']);
    expect(plan.steps.some((step)=>step.action==='select-non-conflicting-scope')).toBe(true);
    expect(plan.steps.at(-1).action).toBe('package-reusable-result');
  });

  it('uses zero advanced calls for deterministic work',()=>{
    const plan=cognitivePlanner(tasks[1]);
    expect(plan.estimatedAdvancedCalls).toBe(0);
    expect(scorePlan(tasks[1],plan).checks.avoidsAdvancedCall).toBe(true);
  });

  it('adds independent verification for high-risk work',()=>{
    const plan=cognitivePlanner(tasks[2]);
    expect(plan.steps.some((step)=>step.action==='require-independent-verification')).toBe(true);
    expect(plan.rollback).toBe(true);
  });

  it('keeps the discarded baseline explicit for reproducibility',()=>{
    const baseline=baselinePlanner(tasks[0]);
    expect(baseline.strategy).toBe('generic-linear');
    expect(scorePlan(tasks[0],baseline).score).toBeLessThan(0.5);
  });
});
