import {describe,expect,it} from 'vitest';
import {budgetAction,evaluateCognitiveBudget,isBudgetProtectedTask,normalizeCognitiveBudgetSettings,normalizeCognitiveBudgetUsage,summarizeBudgetDecision} from './cognitive-budget';

const settings={dailyLimitUsd:1,monthlyLimitUsd:20,warnPercent:80,enforcementMode:'protect' as const};

describe('normalizeCognitiveBudgetSettings',()=>{
 it('repara valores corruptos y limita el umbral',()=>{
  expect(normalizeCognitiveBudgetSettings({dailyLimitUsd:'NaN',monthlyLimitUsd:-4,warnPercent:140,enforcementMode:'otro'})).toEqual({dailyLimitUsd:1,monthlyLimitUsd:20,warnPercent:100,enforcementMode:'observe'});
 });
 it('conserva valores válidos y modo protección',()=>expect(normalizeCognitiveBudgetSettings({dailyLimitUsd:'2.5',monthlyLimitUsd:30,warnPercent:75,enforcementMode:'protect'})).toEqual({dailyLimitUsd:2.5,monthlyLimitUsd:30,warnPercent:75,enforcementMode:'protect'}));
});

describe('normalizeCognitiveBudgetUsage',()=>{
 it('impide costos negativos, infinitos o no numéricos',()=>{expect(normalizeCognitiveBudgetUsage({todayUsd:-1,monthUsd:Infinity})).toEqual({todayUsd:0,monthUsd:0});expect(normalizeCognitiveBudgetUsage({todayUsd:'0.4',monthUsd:'3'})).toEqual({todayUsd:.4,monthUsd:3});});
});

describe('evaluateCognitiveBudget',()=>{
 it('mantiene estado normal por debajo del umbral',()=>{const out=evaluateCognitiveBudget(settings,{todayUsd:.3,monthUsd:4});expect(out.state).toBe('ok');expect(out.dailyPercent).toBe(30);});
 it('activa advertencia sin exceder',()=>{const out=evaluateCognitiveBudget(settings,{todayUsd:.8,monthUsd:4});expect(out.state).toBe('warning');expect(out.warning).toBe(true);});
 it('marca exceso por cualquiera de los límites',()=>{const out=evaluateCognitiveBudget(settings,{todayUsd:.4,monthUsd:21});expect(out.state).toBe('exceeded');expect(out.remainingMonthUsd).toBe(0);});
 it('nunca propaga NaN desde configuración o uso corruptos',()=>{const out=evaluateCognitiveBudget({dailyLimitUsd:NaN,monthlyLimitUsd:Infinity,warnPercent:NaN,enforcementMode:'protect'},{todayUsd:NaN,monthUsd:-1});expect(out.dailyPercent).toBe(0);expect(out.monthlyPercent).toBe(0);expect(Number.isFinite(out.remainingTodayUsd)).toBe(true);});
});

describe('budgetAction',()=>{
 const exceeded=evaluateCognitiveBudget(settings,{todayUsd:1.2,monthUsd:3});
 it('degrada solamente tareas ordinarias',()=>expect(budgetAction(exceeded,false,false).action).toBe('degrade'));
 it('preserva tareas sensibles y solicitudes explícitas de alta inteligencia',()=>{expect(budgetAction(exceeded,true,false).action).toBe('allow-protected');expect(budgetAction(exceeded,false,true).action).toBe('allow-protected');});
 it('no aplica cambios en modo observación',()=>expect(budgetAction({...exceeded,enforcementMode:'observe'},false,false).action).toBe('allow'));
 it('resume una decisión sin contenido privado',()=>expect(summarizeBudgetDecision(exceeded,budgetAction(exceeded,false,false))).toMatchObject({state:'exceeded',action:'degrade',dailyPercent:120}));
});

describe('isBudgetProtectedTask',()=>{
 it('protege salud, seguridad, legal y finanzas personales',()=>{expect(isBudgetProtectedTask('Tengo dolor intenso','consulta general')).toBe(true);expect(isBudgetProtectedTask('audita una vulnerabilidad','ingeniería de software')).toBe(true);expect(isBudgetProtectedTask('revisa mi saldo','finanzas personales')).toBe(true);});
 it('permite ahorro en tareas ordinarias',()=>expect(isBudgetProtectedTask('resume este texto','consulta general')).toBe(false));
});
