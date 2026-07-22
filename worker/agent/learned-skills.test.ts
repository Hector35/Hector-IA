import {describe,expect,it} from 'vitest';
import {learnedSkillFingerprint,nextLearnedSkillSignal,normalizeLearningText} from './learned-skills';

describe('learned skill lifecycle',()=>{
 it('deduplica objetivos equivalentes sin depender de acentos ni orden de skills',()=>{
  expect(normalizeLearningText('  Corrige Héctor OS. ')).toBe('corrige hector os');
  expect(learnedSkillFingerprint('Corrige el error de compilación',['runner','github'])).toBe(learnedSkillFingerprint('Error de compilacion: corrige el',['github','runner']));
 });
 it('promueve solo después de tres éxitos sin fallos',()=>{
  let signal={successes:0,failures:0,confidence:.4,status:'candidate' as const};
  signal=nextLearnedSkillSignal(signal,'success');expect(signal.status).toBe('candidate');
  signal=nextLearnedSkillSignal(signal,'success');expect(signal.status).toBe('candidate');
  signal=nextLearnedSkillSignal(signal,'success');expect(signal.status).toBe('active');
 });
 it('degrada, desactiva y no reactiva automáticamente una habilidad deshabilitada',()=>{
  let signal=nextLearnedSkillSignal({successes:3,failures:0,confidence:.9,status:'active'},'failure');expect(signal.status).toBe('active');
  signal=nextLearnedSkillSignal(signal,'failure');expect(signal.status).toBe('degraded');
  signal=nextLearnedSkillSignal(signal,'failure');expect(signal.status).toBe('disabled');
  expect(nextLearnedSkillSignal(signal,'success').status).toBe('disabled');
 });
});
