import {describe,expect,it} from 'vitest';
import {renderSystemReport,shortImprovementPrompt,SYSTEM_VERSION} from './system-manifest';

describe('system manifest',()=>{
 it('expone versión, capacidades, límites y prompt corto',()=>{
  const text=renderSystemReport(80,'B',['runner']);
  expect(text).toContain(`Héctor OS ${SYSTEM_VERSION}`);
  expect(text).toContain('Qué puede hacer ahora');
  expect(text).toContain('Limitaciones actuales');
  expect(text).toContain('Prompt corto para mejorar');
  expect(shortImprovementPrompt(['runner'])).toContain('runner');
 });
});
