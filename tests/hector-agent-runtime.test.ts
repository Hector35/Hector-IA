import {describe,expect,it} from 'vitest';
import {hectorAgentLimitReason,hectorAgentRunnerControlReason,type HectorAgentRuntimeGuard} from '../worker/lib/hector-agent-runtime';

const base:HectorAgentRuntimeGuard={
 goalId:'goal',maxIterations:3,maxRuntimeSeconds:600,maxCostUsd:1,maxConsecutiveErrors:2,
 accumulatedRuntimeMs:0,accumulatedCostUsd:0,consecutiveErrors:0
};

describe('Héctor Agent hard runtime limits',()=>{
 it('permite hasta el último ciclo y bloquea antes del siguiente',()=>{
  expect(hectorAgentLimitReason(base,3,'before')).toBeNull();
  expect(hectorAgentLimitReason(base,3,'after')).toContain('3 ciclos');
  expect(hectorAgentLimitReason(base,4,'before')).toContain('3 ciclos');
 });

 it('bloquea por tiempo acumulado',()=>{
  expect(hectorAgentLimitReason({...base,accumulatedRuntimeMs:600_000},1,'before')).toContain('tiempo acumulado');
 });

 it('bloquea por presupuesto acumulado incluso con presupuesto cero',()=>{
  expect(hectorAgentLimitReason({...base,maxCostUsd:0},1,'before')).toContain('Presupuesto');
  expect(hectorAgentLimitReason({...base,accumulatedCostUsd:1},1,'before')).toContain('Presupuesto');
 });

 it('bloquea al alcanzar errores consecutivos',()=>{
  expect(hectorAgentLimitReason({...base,consecutiveErrors:2},1,'before')).toContain('errores consecutivos');
 });
});

describe('Héctor Agent runner revocation guard',()=>{
 const active={isHectorAgent:true,status:'working',paused:false,autoEnabled:true,lastError:null,limitReason:null};

 it('no altera trabajos de programación ajenos a Héctor Agent',()=>{
  expect(hectorAgentRunnerControlReason({...active,isHectorAgent:false,status:'blocked'})).toBeNull();
 });

 it('revoca el runner cuando el agente está pausado o detenido',()=>{
  expect(hectorAgentRunnerControlReason({...active,paused:true})).toContain('detenido');
  expect(hectorAgentRunnerControlReason({...active,autoEnabled:false})).toContain('detenido');
 });

 it('respeta un bloqueo explícito del objetivo',()=>{
  expect(hectorAgentRunnerControlReason({...active,status:'blocked',lastError:'Pausado desde Héctor Agent'})).toBe('Pausado desde Héctor Agent');
 });

 it('permite continuar mientras sigue activo y dentro de límites',()=>{
  expect(hectorAgentRunnerControlReason(active)).toBeNull();
 });

 it('propaga el límite duro calculado por backend',()=>{
  expect(hectorAgentRunnerControlReason({...active,limitReason:'Presupuesto del objetivo alcanzado (1.00 USD)'})).toContain('Presupuesto');
 });
});
