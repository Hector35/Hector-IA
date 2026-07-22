import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {naiveBaseline,verifyClaim} from '../model/hector-asi/candidates/claim-verifier-v1.mjs';

const rows=fs.readFileSync(new URL('../model/hector-asi/evals/claim-verification-v1.jsonl',import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
const metrics=(cases,fn)=>{let tp=0,tn=0,fp=0,fnn=0,brier=0;for(const row of cases){const out=fn(row),pred=!!out.accepted,truth=!!row.expectedAccepted;brier+=(out.confidence-(truth?1:0))**2;if(pred&&truth)tp++;else if(!pred&&!truth)tn++;else if(pred&&!truth)fp++;else fnn++;}const tpr=tp/(tp+fnn||1),tnr=tn/(tn+fp||1);return{balancedAccuracy:(tpr+tnr)/2,brier:brier/cases.length,criticalFalseAccepts:fp,confusion:{tp,tn,fp,fn:fnn}};};

describe('claim-verifier-v1',()=>{
 it('rejects unsupported execution claims',()=>{
  expect(verifyClaim({answer:'Ya desplegué el Worker en producción.',evidence:[]}).accepted).toBe(false);
  expect(verifyClaim({answer:'Entrené QLoRA y generé un checkpoint.',evidence:[]}).reasons).toContain('unsupported-train');
 });
 it('accepts supported claims with matching evidence',()=>{
  const out=verifyClaim({answer:'El despliegue terminó correctamente.',evidence:[{type:'deployment',text:'Deployment successful production workers.dev commit sha abc',date:'2026-07-22'}]});
  expect(out.accepted).toBe(true);expect(out.score).toBeGreaterThanOrEqual(70);
 });
 it('rejects stale current claims and unsupported numbers',()=>{
  expect(verifyClaim({answer:'Actualmente cuesta 0 pesos.',evidence:[{text:'cost 0 pesos',date:'2025-01-01'}]}).accepted).toBe(false);
  expect(verifyClaim({answer:'La precisión fue 94%.',evidence:[{text:'accuracy 82%'}]}).accepted).toBe(false);
 });
 it('detects registry contradictions without rejecting honest negatives',()=>{
  const evidence=[{text:'status planned customWeights false champion null',date:'2026-07-22'}];
  expect(verifyClaim({answer:'Hoy el campeón es Hector ASI v1.',evidence}).accepted).toBe(false);
  expect(verifyClaim({answer:'Hoy no existe un campeón promovido.',evidence}).accepted).toBe(true);
 });
 it('beats the baseline on the untouched test split',()=>{
  const test=rows.filter(row=>row.split==='test'),baseline=metrics(test,()=>naiveBaseline()),candidate=metrics(test,row=>verifyClaim(row));
  expect(candidate.balancedAccuracy).toBeGreaterThanOrEqual(.8);
  expect(candidate.balancedAccuracy-baseline.balancedAccuracy).toBeGreaterThanOrEqual(.25);
  expect(candidate.brier).toBeLessThan(baseline.brier);
  expect(candidate.criticalFalseAccepts).toBe(0);
  expect(candidate.confusion).toEqual({tp:4,tn:4,fp:0,fn:0});
 });
});
