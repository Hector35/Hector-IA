import {describe,expect,it} from 'vitest';
import {budgetAction,evaluateCognitiveBudget,isBudgetProtectedTask,summarizeBudgetDecision} from './cognitive-budget';

const settings={dailyLimitUsd:1,monthlyLimitUsd:20,warnPercent:80,enforcementMode:'protect' as const};

describe('evaluateCognitiveBudget',()=>{
 it('mantiene estado normal por debajo del umbral',()=>{const out=evaluateCognitiveBudget(settings,{todayUsd:.3,monthUsd:4});expect(out.state).toBe('ok');expect(out.dailyPercent).toBe(30);});
 it('activa advertencia sin exceder',()=>{const out=evaluateCognitiveBudget(settings,{todayUsd:.8,monthUsd:4});expect(out.state).toBe('warning');expect(out.warning).toBe(true);});
 it('marca exceso por cualquiera de los límites',()=>{const out=evaluateCognitiveBudget(settings,{todayUsd:.4,monthUsd:21});expect(out.state).toBe('exceeded');expect(out.remainingMonthUsd).toBe(0);});
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
