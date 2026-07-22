import {describe,expect,it} from 'vitest';
import {parseProgrammedText} from './scheduled-tasks-ui';

const now=new Date('2026-07-22T12:00:00.000Z');

describe('parseProgrammedText',()=>{
 it('interpreta intervalos en minutos',()=>{
  const draft=parseProgrammedText('Cada 15 minutos revisa el proyecto y corrige errores',now);
  expect(draft).toMatchObject({cadence:'custom_minutes',intervalMinutes:15});
 });

 it('interpreta horas, días y semanas',()=>{
  expect(parseProgrammedText('Cada 2 horas revisa el estado del sistema',now).cadence).toBe('every_2_hours');
  expect(parseProgrammedText('Diario genera un reporte de avances',now).cadence).toBe('daily');
  expect(parseProgrammedText('Cada semana revisa los objetivos',now).cadence).toBe('weekly');
 });

 it('interpreta una espera inicial en minutos',()=>{
  const draft=parseProgrammedText('En 20 minutos ejecuta una revisión completa',now);
  expect(new Date(draft.firstRunAt).getTime()-now.getTime()).toBe(20*60_000);
  expect(draft.cadence).toBe('once');
 });

 it('interpreta una hora concreta futura',()=>{
  const draft=parseProgrammedText('Cada día a las 14:30 genera el resumen',now);
  expect(draft.cadence).toBe('daily');
  expect(draft.firstRunAt.endsWith('14:30')).toBe(true);
 });

 it('usa una ejecución única cercana cuando no hay frecuencia',()=>{
  const draft=parseProgrammedText('Revisa ahora el último despliegue y dime si funciona',now);
  expect(draft.cadence).toBe('once');
  expect(new Date(draft.firstRunAt).getTime()-now.getTime()).toBe(5*60_000);
 });
});
