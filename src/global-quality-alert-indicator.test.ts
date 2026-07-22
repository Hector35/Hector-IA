import {describe,expect,it} from 'vitest';
import {alertsRequiringAttention,detectAlertTransitions,snapshotAlerts,type GlobalQualityAlert} from './global-quality-alert-indicator';

const base:GlobalQualityAlert={id:'a1',task:'consulta general',state:'active',reason:'calidad baja',acknowledgedAt:null,mutedUntil:null,resolvedAt:null,muted:false};

describe('global quality alert indicator',()=>{
 it('cuenta solo alertas activas que requieren atención',()=>{
  expect(alertsRequiringAttention([base,{...base,id:'a2',acknowledgedAt:'2026-07-21T12:00:00Z'},{...base,id:'a3',mutedUntil:'2026-07-22T12:00:00Z'}],Date.parse('2026-07-21T13:00:00Z'))).toEqual([base]);
 });
 it('notifica activación solo cuando es nueva o reaparece',()=>{
  expect(detectAlertTransitions({},[base],false)).toEqual([]);
  expect(detectAlertTransitions({},[base],true)).toEqual([{kind:'activated',alert:base}]);
  expect(detectAlertTransitions({a1:'active'},[base],true)).toEqual([]);
  expect(detectAlertTransitions({a1:'resolved'},[base],true)).toEqual([{kind:'activated',alert:base}]);
 });
 it('notifica recuperación una sola vez',()=>{
  const recovered={...base,state:'resolved' as const,resolvedAt:'2026-07-21T14:00:00Z'};
  expect(detectAlertTransitions({a1:'active'},[recovered],true)).toEqual([{kind:'recovered',alert:recovered}]);
  expect(detectAlertTransitions({a1:'resolved'},[recovered],true)).toEqual([]);
 });
 it('guarda únicamente identificador y estado',()=>{
  expect(snapshotAlerts([base])).toEqual({a1:'active'});
 });
});
