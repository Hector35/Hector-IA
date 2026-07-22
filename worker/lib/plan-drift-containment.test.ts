import {describe,expect,it} from 'vitest';
import {aggregateDriftContainment} from './plan-drift-containment';
import type {DriftIncident} from './plan-drift-incidents';

const now=Date.parse('2026-07-22T06:00:00Z');
const incident=(id:string,cause:DriftIncident['cause'],status:DriftIncident['status'],hoursAgo:number):DriftIncident=>({id,task:'consulta general',model:'gpt-test',costUsd:0,createdAt:new Date(now-hoursAgo*3600000).toISOString(),planHash:'abc123456789',planVersion:'1.0.0',status,cause,summary:'bloqueada',differences:['modelo distinto'],recoveryPrompt:'reintenta',retryAvailable:true,conversationId:'c',userMessageId:'m',lastActionAt:null});

describe('aggregateDriftContainment',()=>{
 it('mantiene saludable una causa aislada',()=>{expect(aggregateDriftContainment([incident('1','router','active',1)],now)[0]).toMatchObject({status:'healthy',incidents:1});});
 it('observa dos desviaciones sin contener todavía',()=>{expect(aggregateDriftContainment([incident('1','budget','active',2),incident('2','budget','recovered',1)],now)[0].status).toBe('watching');});
 it('contiene tres desviaciones con al menos dos activas',()=>{expect(aggregateDriftContainment([incident('1','provider','active',3),incident('2','provider','retry-failed',2),incident('3','provider','recovered',1)],now)[0]).toMatchObject({status:'contained',incidents:3,active:2});});
 it('habilita prueba tras seis horas de enfriamiento',()=>{const result=aggregateDriftContainment([incident('1','cognition','active',10),incident('2','cognition','retry-failed',9),incident('3','cognition','recovered',8)],now)[0];expect(result.status).toBe('probe-ready');expect(result.nextProbeAt).toBeTruthy();});
 it('ignora incidentes fuera de 24 horas para el umbral',()=>{expect(aggregateDriftContainment([incident('1','feedback','active',30),incident('2','feedback','active',29),incident('3','feedback','active',1)],now)[0]).toMatchObject({status:'healthy',incidents:1});});
});
