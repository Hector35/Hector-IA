import {describe,expect,it} from 'vitest';
import {applyBudgetQualityGovernance,normalizeBudgetQualityGovernanceMode} from './budget-quality-governance';
import type {BudgetQualityPolicy} from './budget-quality-breaker';

const policy=(state:BudgetQualityPolicy['state']='healthy'):BudgetQualityPolicy=>({state,sampleCount:8,acceptedCount:7,negativeCount:1,correctionCount:0,acceptanceRate:.875,negativeRate:.125,correctionRate:0,lastDegradedAt:null,reason:'calidad estable'});

describe('budget quality governance',()=>{
 it('normaliza valores desconocidos a automático',()=>expect(normalizeBudgetQualityGovernanceMode('x')).toBe('auto'));
 it('mantiene la decisión estadística en automático',()=>expect(applyBudgetQualityGovernance(policy('probe'),{mode:'auto',reason:null,updatedAt:null}).state).toBe('probe'));
 it('desactiva ahorro permanentemente en modo proteger',()=>{const out=applyBudgetQualityGovernance(policy(),{mode:'protect',reason:'Salud requiere máxima calidad',updatedAt:null});expect(out.state).toBe('suspended');expect(out.reason).toContain('Salud');});
 it('limita la categoría a pruebas controladas',()=>expect(applyBudgetQualityGovernance(policy('healthy'),{mode:'probe',reason:'Validar antes de ahorrar',updatedAt:null}).state).toBe('probe'));
 it('permite reactivar ahorro manualmente',()=>expect(applyBudgetQualityGovernance(policy('suspended'),{mode:'allow',reason:'Revisión manual aprobada',updatedAt:null}).state).toBe('healthy'));
});
