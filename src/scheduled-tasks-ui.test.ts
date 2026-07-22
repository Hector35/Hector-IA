import {describe,expect,it} from 'vitest';
import {choiceFromTask,deriveScheduledTitle,scheduleConfig} from './scheduled-tasks-ui';

describe('programmed tasks UI contract',()=>{
 it('genera un nombre útil desde la tarea',()=>{expect(deriveScheduledTitle('Revisa el estado real de Héctor OS. Después corrige errores.')).toBe('Revisa el estado real de Héctor OS');});
 it('crea por defecto una tarea manual que solo corre al presionar Ejecutar',()=>{expect(scheduleConfig('manual')).toEqual({cadence:'once',intervalMinutes:null,enabled:false});});
 it('normaliza recurrencia por minutos',()=>{expect(scheduleConfig('minutes',7)).toEqual({cadence:'hourly',intervalMinutes:7,enabled:true});expect(scheduleConfig('minutes',0).intervalMinutes).toBe(5);expect(scheduleConfig('minutes',20000).intervalMinutes).toBe(10080);});
 it('reconoce tareas manuales y personalizadas existentes',()=>{expect(choiceFromTask({cadence:'once',interval_minutes:null,enabled:false,run_count:0})).toBe('manual');expect(choiceFromTask({cadence:'hourly',interval_minutes:15,enabled:true,run_count:2})).toBe('minutes');expect(choiceFromTask({cadence:'hourly',interval_minutes:60,enabled:true,run_count:2})).toBe('hourly');});
});
