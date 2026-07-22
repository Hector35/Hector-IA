import {describe,expect,it} from 'vitest';
import {intervalMinutesFor,isActiveScheduledJob,nextScheduledRun,normalizeIntervalMinutes,normalizeRunAt,renderScheduledPrompt,scheduledJobId,type ScheduledTaskDefinition} from './scheduler';

const task:ScheduledTaskDefinition={
 id:'11111111-1111-4111-8111-111111111111',title:'Continuar Héctor OS',prompt:'Revisa el estado actual y realiza la siguiente mejora prioritaria.',kind:'programming',cadence:'hourly',reasoning_level:'high',autonomy_mode:'continuous',allow_web:1,next_run_at:'2026-07-21T12:00:00.000Z'
};

describe('scheduler',()=>{
 it('convierte cadencias e intervalos personalizados',()=>{expect(intervalMinutesFor('once')).toBeNull();expect(intervalMinutesFor('hourly')).toBe(60);expect(intervalMinutesFor('weekly')).toBe(10080);expect(intervalMinutesFor('custom_minutes',15)).toBe(15);});
 it('valida minutos entre uno y siete días',()=>{expect(normalizeIntervalMinutes(1)).toBe(1);expect(normalizeIntervalMinutes(10080)).toBe(10080);expect(()=>normalizeIntervalMinutes(0)).toThrow('entre 1 minuto');expect(()=>normalizeIntervalMinutes(10081)).toThrow('7 días');});
 it('salta intervalos vencidos sin crear una tormenta de ejecuciones',()=>{expect(nextScheduledRun('hourly','2026-07-21T12:00:00.000Z',Date.parse('2026-07-21T15:40:00.000Z'))).toBe('2026-07-21T16:00:00.000Z');expect(nextScheduledRun('custom_minutes','2026-07-21T12:00:00.000Z',Date.parse('2026-07-21T12:17:00.000Z'),5)).toBe('2026-07-21T12:20:00.000Z');expect(nextScheduledRun('once','2026-07-21T12:00:00.000Z')).toBeNull();});
 it('rechaza fechas antiguas o excesivamente lejanas',()=>{const now=Date.parse('2026-07-21T12:00:00.000Z');expect(normalizeRunAt('2026-07-21T12:02:00.000Z',now)).toBe('2026-07-21T12:02:00.000Z');expect(()=>normalizeRunAt('2026-07-21T11:00:00.000Z',now)).toThrow('pasado');expect(()=>normalizeRunAt('2028-01-01T00:00:00.000Z',now)).toThrow('un año');});
 it('genera un UUID estable por turno para evitar ejecuciones duplicadas',async()=>{const first=await scheduledJobId(task.id,'2026-07-21T12:00:00.000Z');expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);expect(await scheduledJobId(task.id,'2026-07-21T12:00:00.000Z')).toBe(first);expect(await scheduledJobId(task.id,'2026-07-21T13:00:00.000Z')).not.toBe(first);});
 it('reconoce trabajos todavía activos',()=>{expect(isActiveScheduledJob('working')).toBe(true);expect(isActiveScheduledJob('completed')).toBe(false);});
 it('inyecta inteligencia alta, continuidad y el resultado anterior',()=>{const prompt=renderScheduledPrompt(task,{status:'completed',result:'Se añadió autenticación segura.'});expect(prompt).toContain('modelo de razonamiento profundo');expect(prompt).toContain('responsable de progreso continuo');expect(prompt).toContain('No repitas trabajo ya completado');expect(prompt).toContain('Se añadió autenticación segura.');expect(prompt).toContain('no fusiones automáticamente');});
});
