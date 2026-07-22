import {describe,expect,it} from 'vitest';
import {learningCandidate,normalizeObjective} from './learning';

describe('agent experience ledger',()=>{
 it('normaliza objetivos para recuperación futura',()=>{
  expect(normalizeObjective('  Corrige   Héctor OS: ¡pruebas y build!  ')).toBe('corrige hector os pruebas y build');
 });
 it('solo propone aprendizaje desde resultados verificados con evidencia',()=>{
  const base={objective:'Corrige el build',result:'Ejecutar typecheck y reparar imports',skills:['github-code'],status:'completed'};
  expect(learningCandidate(base)).toBeNull();
  expect(learningCandidate({...base,verified:true,evidence:[]})).toBeNull();
  expect(learningCandidate({...base,verified:true,evidence:[{kind:'test',label:'npm test',verified:true}]})).toMatchObject({status:'candidate',confidence:.6});
 });
 it('rechaza fallos aunque contengan texto reutilizable',()=>{
  expect(learningCandidate({objective:'Corregir',result:'parece funcionar',skills:[],status:'blocked',verified:true,evidence:[{kind:'text',verified:true}]})).toBeNull();
 });
});
