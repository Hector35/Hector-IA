import {describe,expect,it} from 'vitest';
import {activeVisibleAlerts,qualityImpactRecommendation} from './budget-quality-alerts-ui';
import type {QualityImpactSummary} from './quality-impact-summary';

const base={id:'1',task:'consulta general',reason:'calidad baja',triggers:['acceptance'],sampleCount:7,firstSeenAt:'2026-07-21T10:00:00Z',lastSeenAt:'2026-07-21T11:00:00Z',acknowledgedAt:null,resolvedAt:null,muted:false};
const summary=(verdict:QualityImpactSummary['verdict']):QualityImpactSummary=>({verdict,title:'x',detail:'x',tone:'neutral',metrics:[]});

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