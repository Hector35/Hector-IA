import {describe,expect,it} from 'vitest';
import {selectSkills} from './skills';
import {buildPlan} from './planner';

describe('agent skills',()=>{
 it('selecciona código y navegador según intención',()=>{const ids=selectSkills('Corrige el código en GitHub y verifica la interfaz de producción').map(x=>x.id);expect(ids).toContain('github-code');expect(ids).toContain('browser-verify');});
 it('crea fases verificables y limita reintentos',()=>{const plan=buildPlan('Investiga el problema actual');expect(plan.phases.map(x=>x.name)).toEqual(['inspect','plan','execute','test','verify']);expect(plan.maxAttempts).toBe(3);expect(plan.skills).toContain('research-web');});
});