import {describe,expect,it} from 'vitest';
import {activeVisibleAlerts,qualityGovernanceProposal,qualityImpactRecommendation} from './budget-quality-alerts-ui';
import type {QualityImpactSummary} from './quality-impact-summary';

const base={id:'1',task:'consulta general',reason:'calidad baja',triggers:['acceptance'],sampleCount:7,firstSeenAt:'2026-07-21T10:00:00Z',lastSeenAt:'2026-07-21T11:00:00Z',acknowledgedAt:null,resolvedAt:null,muted:false};
const summary=(verdict:QualityImpactSummary['verdict']):QualityImpactSummary=>({verdict,title:'x',detail:'x',tone:'neutral',metrics:[]});
const policy={category:'consulta general',strategy:'adaptive' as const,status:'promoted',governance_mode:'auto' as const};

describe('activeVisibleAlerts',()=>{
 it('muestra activas no silenciadas',()=>{expect(activeVisibleAlerts([{...base,state:'active' as const,mutedUntil:null}],Date.parse('2026-07-21T12:00:00Z'))).toHaveLength(1);});
 it('oculta activas durante el silencio',()=>{expect(activeVisibleAlerts([{...base,state:'active' as const,mutedUntil:'2026-07-22T12:00:00Z'}],Date.parse('2026-07-21T12:00:00Z'))).toHaveLength(0);});
 it('vuelve a mostrar cuando expira el silencio',()=>{expect(activeVisibleAlerts([{...base,state:'active' as const,mutedUntil:'2026-07-21T11:00:00Z'}],Date.parse('2026-07-21T12:00:00Z'))).toHaveLength(1);});
 it('no muestra alertas resueltas',()=>{expect(activeVisibleAlerts([{...base,state:'resolved' as const,mutedUntil:null,resolvedAt:'2026-07-21T11:00:00Z'}],Date.parse('2026-07-21T12:00:00Z'))).toHaveLength(0);});
});

describe('qualityImpactRecommendation',()=>{
 it('mantiene protección cuando fue efectiva',()=>{expect(qualityImpactRecommendation(summary('effective'))).toContain('Mantener protección');});
 it('propone automático o prueba cuando el costo no se justifica',()=>{expect(qualityImpactRecommendation(summary('high-cost-no-proof'))).toContain('Volver a automático');});
 it('espera evidencia cuando es demasiado pronto',()=>{expect(qualityImpactRecommendation(summary('too-early'))).toContain('Esperar más evidencia');});
 it('propone prueba controlada tras estabilización',()=>{expect(qualityImpactRecommendation(summary('candidate-probe'))).toContain('prueba controlada');});
});

describe('qualityGovernanceProposal',()=>{
 it('propone congelar cuando la protección fue efectiva',()=>{expect(qualityGovernanceProposal(summary('effective'),policy)).toMatchObject({action:'freeze',label:'Mantener protección'});});
 it('no repite el congelamiento si ya está congelada',()=>{expect(qualityGovernanceProposal(summary('effective'),{...policy,governance_mode:'frozen'})).toBeNull();});
 it('vuelve a automático desde una estrategia congelada costosa',()=>{expect(qualityGovernanceProposal(summary('high-cost-no-proof'),{...policy,governance_mode:'frozen'})).toMatchObject({action:'unfreeze',label:'Volver a automático'});});
 it('reactiva una categoría excluida',()=>{expect(qualityGovernanceProposal(summary('high-cost-no-proof'),{...policy,governance_mode:'excluded'})).toMatchObject({action:'include',label:'Volver a automático'});});
 it('inicia prueba controlada en la estrategia base',()=>{expect(qualityGovernanceProposal(summary('candidate-probe'),policy)).toMatchObject({action:'manual_rollback',label:'Iniciar prueba controlada'});});
 it('no propone cambios cuando falta evidencia o política',()=>{expect(qualityGovernanceProposal(summary('too-early'),policy)).toBeNull();expect(qualityGovernanceProposal(summary('effective'))).toBeNull();});
});
