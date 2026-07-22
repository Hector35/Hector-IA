import {describe,expect,it} from 'vitest';
import {actionableChatAlerts,governanceReason,type ChatQualityAlert} from './chat-quality-alert-strip';
const base:ChatQualityAlert={id:'1',task:'consulta general',state:'active',reason:'calidad baja',sampleCount:8,acknowledgedAt:null,mutedUntil:null,muted:false};
describe('actionableChatAlerts',()=>{
 it('muestra solo alertas activas, no reconocidas y no silenciadas',()=>{expect(actionableChatAlerts([base],Date.parse('2026-07-21T12:00:00Z'))).toEqual([base]);});
 it('oculta alertas reconocidas',()=>{expect(actionableChatAlerts([{...base,acknowledgedAt:'2026-07-21T11:00:00Z'}])).toHaveLength(0);});
 it('oculta alertas silenciadas vigentes',()=>{expect(actionableChatAlerts([{...base,mutedUntil:'2026-07-22T12:00:00Z'}],Date.parse('2026-07-21T12:00:00Z'))).toHaveLength(0);});
 it('ignora alertas resueltas',()=>{expect(actionableChatAlerts([{...base,state:'resolved'}])).toHaveLength(0);});
});
describe('governanceReason',()=>{
 it('genera una razón auditable para una prueba controlada',()=>{expect(governanceReason('probe','consulta general')).toContain('Prueba controlada');expect(governanceReason('probe','consulta general')).toContain('consulta general');});
 it('genera una razón auditable para protección manual',()=>{expect(governanceReason('protect','finanzas personales')).toContain('Protección manual');expect(governanceReason('protect','finanzas personales')).toContain('finanzas personales');});
});
