import {describe,expect,it} from 'vitest';
import {verifyClaim} from '../model/hector-asi/candidates/claim-verifier-v1.mjs';

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
});
