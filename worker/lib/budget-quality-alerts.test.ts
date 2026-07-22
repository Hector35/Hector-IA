import {describe,expect,it} from 'vitest';
import {reconcileBudgetQualityAlert,type BudgetQualityAlertRow} from './budget-quality-alerts';
import type {BudgetQualityCategory} from './budget-quality-breaker';

const suspended:BudgetQualityCategory={task:'consulta general',state:'suspended',sampleCount:8,acceptedCount:4,negativeCount:4,correctionCount:2,acceptanceRate:.5,negativeRate:.5,correctionRate:.25,lastDegradedAt:'2026-07-21T12:00:00.000Z',nextProbeAt:'2026-07-22T12:00:00.000Z',triggeredBy:['acceptance','negative'],reason:'degradaciones suspendidas'};
const healthy:BudgetQualityCategory={...suspended,state:'healthy',triggeredBy:[],reason:'calidad recuperada',nextProbeAt:null,acceptanceRate:.9,negativeRate:.1};
const existing:BudgetQualityAlertRow={id:'a',task:suspended.task,state:'active',reason:'anterior',triggersJson:'["acceptance"]',sampleCount:6,firstSeenAt:'2026-07-20T10:00:00.000Z',lastSeenAt:'2026-07-20T11:00:00.000Z',acknowledgedAt:'2026-07-20T12:00:00.000Z',mutedUntil:'2026-07-23T12:00:00.000Z',resolvedAt:null};

describe('reconcileBudgetQualityAlert',()=>{
 it('crea una alerta activa para una suspensión nueva',()=>{const result=reconcileBudgetQualityAlert(null,suspended,'2026-07-21T18:00:00.000Z');expect(result).toMatchObject({state:'active',firstSeenAt:'2026-07-21T18:00:00.000Z',lastSeenAt:'2026-07-21T18:00:00.000Z',acknowledgedAt:null,mutedUntil:null,resolvedAt:null,sampleCount:8});expect(JSON.parse(result.triggersJson)).toEqual(['acceptance','negative']);});
 it('conserva reconocimiento y silencio mientras continúa activa',()=>{const result=reconcileBudgetQualityAlert(existing,suspended,'2026-07-21T18:00:00.000Z');expect(result.firstSeenAt).toBe(existing.firstSeenAt);expect(result.acknowledgedAt).toBe(existing.acknowledgedAt);expect(result.mutedUntil).toBe(existing.mutedUntil);});
 it('resuelve la alerta cuando la calidad se recupera',()=>{const result=reconcileBudgetQualityAlert(existing,healthy,'2026-07-21T18:00:00.000Z');expect(result).toMatchObject({state:'resolved',resolvedAt:'2026-07-21T18:00:00.000Z',mutedUntil:null,reason:'calidad recuperada'});});
 it('reinicia reconocimiento y silencio al reactivarse',()=>{const resolved={...existing,state:'resolved' as const,resolvedAt:'2026-07-21T15:00:00.000Z'};const result=reconcileBudgetQualityAlert(resolved,suspended,'2026-07-21T18:00:00.000Z');expect(result).toMatchObject({state:'active',firstSeenAt:'2026-07-21T18:00:00.000Z',acknowledgedAt:null,mutedUntil:null,resolvedAt:null});});
});
