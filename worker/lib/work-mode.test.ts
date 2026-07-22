import {describe,expect,it} from 'vitest';
import {parseWorkModeResult,renderWorkModePrompt,workModeFailureTransition,workModeTitle} from './work-mode';

describe('work mode protocol',()=>{
 it('construye una instrucción continua sin preguntas de conveniencia',()=>{
  const prompt=renderWorkModePrompt('Termina la integración y pruébala','Se corrigió la API.',2);
  expect(prompt).toContain('MODO TRABAJO CONTINUO');
  expect(prompt).toContain('no repitas trabajo ya validado');
  expect(prompt).toContain('Se corrigió la API.');
  expect(prompt).toContain('WORK_STATE: complete');
 });

 it('interpreta continuar y elimina el marcador visible',()=>{
  const result=parseWorkModeResult('Avancé el backend.\nWORK_STATE: continue');
  expect(result).toEqual({state:'continue',retryAfterMinutes:5,text:'Avancé el backend.',explicit:true});
 });

 it('interpreta espera con minutos acotados',()=>{
  expect(parseWorkModeResult('Esperando CI.\nWORK_STATE: waiting\nRETRY_AFTER_MINUTES: 15')).toMatchObject({state:'waiting',retryAfterMinutes:15,text:'Esperando CI.'});
  expect(parseWorkModeResult('WORK_STATE: waiting\nRETRY_AFTER_MINUTES: 99999').retryAfterMinutes).toBe(1440);
 });

 it('solo completa con marcador explícito',()=>{
  expect(parseWorkModeResult('Todo validado.\nWORK_STATE: complete')).toMatchObject({state:'complete',explicit:true,text:'Todo validado.'});
  expect(parseWorkModeResult('Parece listo, pero falta evidencia.')).toMatchObject({state:'continue',explicit:false});
 });

 it('reintenta errores sin límite terminal y conserva el checkpoint',()=>{
  expect(workModeFailureTransition(1)).toEqual({status:'queued',delaySeconds:30,preserveCheckpoint:true});
  expect(workModeFailureTransition(1001)).toMatchObject({status:'queued',preserveCheckpoint:true});
  expect(workModeFailureTransition(1001).delaySeconds).toBeGreaterThan(0);
 });

 it('deriva un título corto del objetivo',()=>{
  expect(workModeTitle('  Construye una interfaz simple. Después pruébala. ')).toBe('Construye una interfaz simple');
 });
});
