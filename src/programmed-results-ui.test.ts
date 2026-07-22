import {describe,expect,it} from 'vitest';
import {canRunProgrammedAgain,programmedResultState} from './programmed-results-ui';

describe('programmedResultState',()=>{
 it('muestra una ejecución activa',()=>expect(programmedResultState('working',null)).toEqual({label:'En ejecución',tone:'running',message:'Héctor OS está trabajando en esta tarea.'}));
 it('muestra el resultado completado',()=>expect(programmedResultState('completed','Reporte terminado')).toEqual({label:'Completada',tone:'completed',message:'Reporte terminado'}));
 it('hace visible un fallo',()=>expect(programmedResultState('blocked','Falta autorización')).toEqual({label:'Requiere atención',tone:'failed',message:'Falta autorización'}));
 it('mantiene un estado vacío comprensible',()=>expect(programmedResultState(null,null).label).toBe('Sin resultado'));
});

describe('canRunProgrammedAgain',()=>{
 it('permite repetir tareas terminadas o fallidas',()=>{expect(canRunProgrammedAgain('completed')).toBe(true);expect(canRunProgrammedAgain('blocked')).toBe(true);expect(canRunProgrammedAgain('failed')).toBe(true);});
 it('evita duplicar una ejecución todavía activa',()=>{for(const status of ['queued','working','testing','repairing','running'])expect(canRunProgrammedAgain(status)).toBe(false);});
});
