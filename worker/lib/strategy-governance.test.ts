import {describe,expect,it} from 'vitest';
import {applyGovernance,manualGovernanceUpdate,normalizeGovernanceMode} from './strategy-governance';

describe('strategy governance',()=>{
 it('normaliza modos desconocidos a auto',()=>{expect(normalizeGovernanceMode('x')).toBe('auto');});
 it('una exclusión fuerza baseline',()=>{expect(applyGovernance({strategy:'adaptive',status:'promoted',reason:'auto'},{strategy:'adaptive',status:'promoted',governanceMode:'excluded',governanceReason:'sensible'})).toMatchObject({strategy:'baseline',status:'excluded'});});
 it('una congelación conserva la estrategia vigente',()=>{expect(applyGovernance({strategy:'baseline',status:'rolled_back',reason:'auto'},{strategy:'adaptive',status:'promoted',governanceMode:'frozen',governanceReason:'aprobada'})).toMatchObject({strategy:'adaptive',status:'frozen'});});
 it('rollback manual congela baseline',()=>{expect(manualGovernanceUpdate('manual_rollback',{strategy:'adaptive',status:'promoted'},'Revisión manual')).toEqual({strategy:'baseline',status:'rolled_back',governanceMode:'frozen',reason:'Revisión manual',eventAction:'manual_rollback'});});
 it('incluir devuelve el control al modo automático',()=>{expect(manualGovernanceUpdate('include',{strategy:'baseline',status:'excluded'},'Reactivar')).toMatchObject({governanceMode:'auto'});});
});
