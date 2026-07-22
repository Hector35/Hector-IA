import {describe,expect,it} from 'vitest';
import {duplicateProgrammedPayload,duplicateProgrammedTitle} from './programmed-duplicate-ui';

describe('duplicar Programados',()=>{
 it('crea un nombre reconocible y respeta el límite',()=>{expect(duplicateProgrammedTitle('Reporte diario')).toBe('Copia de Reporte diario');expect(duplicateProgrammedTitle('x'.repeat(120))).toHaveLength(100);});
 it('conserva configuración y retrasa cinco minutos',()=>{const now=new Date('2026-07-22T10:00:00.000Z');const payload=duplicateProgrammedPayload({id:'1',title:'Revisión',prompt:'Revisa el proyecto y reporta avances',kind:'agent',cadence:'custom_minutes',interval_minutes:12,reasoning_level:'high',autonomy_mode:'continuous',allow_web:true},now);expect(payload).toMatchObject({title:'Copia de Revisión',cadence:'custom_minutes',intervalMinutes:12,reasoningLevel:'high',autonomyMode:'continuous',allowWeb:true});expect(new Date(payload.firstRunAt).getTime()-now.getTime()).toBe(5*60_000);});
});
