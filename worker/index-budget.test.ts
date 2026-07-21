import {describe,expect,it} from 'vitest';
import {budgetEvent} from './index';

describe('budgetEvent',()=>{
 it('describe una degradación con porcentajes verificables',()=>{
  expect(budgetEvent({action:'degrade',state:'exceeded',dailyPercent:125,monthlyPercent:101})).toBe('Presupuesto cognitivo aplicado: ruta de menor costo (125% diario, 101% mensual)');
 });
 it('describe decisiones protegidas sin afirmar degradación',()=>{
  expect(budgetEvent({action:'allow-protected',state:'exceeded',dailyPercent:125,monthlyPercent:80})).toBe('Presupuesto cognitivo: allow-protected (exceeded)');
 });
 it('no crea eventos cuando no existe presupuesto de usuario',()=>{expect(budgetEvent(null)).toBeNull();});
});
