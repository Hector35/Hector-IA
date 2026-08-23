import {describe,expect,it} from 'vitest';
import {assessProductionStatuses,assessPullRequestRuns,changesNeedProduction,decodeProgrammingState,encodeProgrammingState,PRODUCTION_CONTEXTS,type ProgrammingLoopState} from './programming-loop';

const state:ProgrammingLoopState={version:2,phase:'pr',branch:'hector-agent/job-1',prNumber:123,prUrl:'https://github.com/Hector35/Hector-IA/pull/123',headSha:'abc123',needsProduction:true,changePaths:['public/turno-rx/app.js'],repairCount:0};

describe('persistent programming loop',()=>{
 it('round-trips durable programming state',()=>expect(decodeProgrammingState(encodeProgrammingState(state))).toEqual(state));
 it('ignores unrelated result text',()=>expect(decodeProgrammingState('PR verificado: https://example.test')).toBeNull());
 it('requires repository PR checks before success',()=>{
  expect(assessPullRequestRuns([]).state).toBe('pending');
  expect(assessPullRequestRuns([{name:'iPhone Visual Audit',status:'completed',conclusion:'success'}]).state).toBe('pending');
  expect(assessPullRequestRuns([{name:'Repository PR Checks',status:'completed',conclusion:'failure'}]).state).toBe('failure');
  expect(assessPullRequestRuns([{name:'Repository PR Checks',status:'completed',conclusion:'success'},{name:'iPhone Visual Audit',status:'completed',conclusion:'success'}]).state).toBe('success');
 });
 it('waits for every production gate and fails closed',()=>{
  const green=PRODUCTION_CONTEXTS.map(context=>({context,state:'success'}));
  expect(assessProductionStatuses(green.slice(0,-1)).state).toBe('pending');
  expect(assessProductionStatuses(green.map((x,i)=>i===1?{...x,state:'failure',description:'smoke failed'}:x)).state).toBe('failure');
  expect(assessProductionStatuses(green).state).toBe('success');
 });
 it('requires production only for runtime/product changes',()=>{
  expect(changesNeedProduction(['public/turno-rx/app.js'])).toBe(true);
  expect(changesNeedProduction(['worker/routes/hector-agent.ts'])).toBe(true);
  expect(changesNeedProduction(['tests/hector-agent.test.ts'])).toBe(false);
 });
});
