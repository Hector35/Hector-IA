import {describe,expect,it} from 'vitest';
import {forecastPlan} from './chat-budget-forecast-ui';

describe('forecastPlan',()=>{
 it('mantiene una consulta sensible breve sin forzar ensamble',()=>{expect(forecastPlan('Revisa la seguridad de mi contraseña')).toEqual({tier:'balanced',passes:1,explicitHigh:false,task:'tarea sensible'});});
 it('detecta programación compleja y varias pasadas',()=>{const plan=forecastPlan('Implementa y audita la arquitectura completa de la API con pruebas y estrategia de despliegue. '.repeat(4));expect(plan.tier).toBe('deep');expect(plan.passes).toBe(3);expect(plan.task).toBe('ingeniería de software');});
 it('reconoce razonamiento alto explícito',()=>{const plan=forecastPlan('Usa razonamiento alto para investigar esta arquitectura');expect(plan.explicitHigh).toBe(true);expect(plan.tier).toBe('deep');expect(plan.passes).toBe(3);});
 it('clasifica saludos breves como fast',()=>{expect(forecastPlan('hola').tier).toBe('fast');});
});
