import {describe,expect,it} from 'vitest';
import {classifyDriftCause,latestActions,normalizeDriftIncident,recoveryPrompt} from './plan-drift-incidents';

describe('plan drift incidents',()=>{
 it('clasifica causas sin confundir proveedor con router',()=>{expect(classifyDriftCause(['proveedor previsto cloudflare, observado openai'])).toBe('provider');expect(classifyDriftCause(['tier previsto balanced, observado deep'])).toBe('router');expect(classifyDriftCause(['pasadas previstas 1, observadas 3'])).toBe('cognition');});
 it('construye un prompt de recuperación acotado al plan',()=>{const prompt=recoveryPrompt({task:'consulta general',planHash:'abcdef1234567890',cause:'router',differences:['tier distinto']});expect(prompt).toContain('abcdef123456');expect(prompt).toContain('No cambies modelo');});
 it('normaliza filas válidas y descarta metadata corrupta',()=>{const row={id:'i1',model:'gpt-x',estimated_cost_usd:.1,created_at:'2026-07-21',metadata_json:JSON.stringify({planHash:'abcdef1234567890',planVersion:'1.0.0',task:'consulta general',verification:{summary:'bloqueada',differences:['modelo no autorizado x']}})};const incident=normalizeDriftIncident(row,new Map([['i1','acknowledged']]));expect(incident).toMatchObject({id:'i1',status:'acknowledged',cause:'router'});expect(normalizeDriftIncident({...row,metadata_json:'{'},new Map())).toBeNull();});
 it('conserva solo la acción más reciente por incidente',()=>{const actions=latestActions([{metadata_json:JSON.stringify({incidentId:'i1',action:'recovery-requested'})},{metadata_json:JSON.stringify({incidentId:'i1',action:'acknowledged'})}]);expect(actions.get('i1')).toBe('recovery-requested');});
});
