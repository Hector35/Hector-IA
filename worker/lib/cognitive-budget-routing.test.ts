import {describe,expect,it} from 'vitest';
import {applyCognitiveBudgetRouting,isBudgetProtectedTask,type BudgetRoute} from './cognitive-budget-routing';
import type {CognitiveBudgetStatus} from './cognitive-budget';

const models={fast:'gpt-5.6-luna',balanced:'gpt-5.6-terra',deep:'gpt-5.6-sol'};
const route=(tier:BudgetRoute['tier']='deep',task='consulta general'):BudgetRoute=>({model:tier==='deep'?models.deep:tier==='balanced'?models.balanced:models.fast,tier,reason:'complejidad detectada',reasoning:tier==='deep'?'high':tier==='balanced'?'medium':'low',task,needsWeb:false});
const status=(overrides:Partial<CognitiveBudgetStatus>={}):CognitiveBudgetStatus=>({dailyLimitUsd:1,monthlyLimitUsd:20,warnPercent:80,enforcementMode:'protect',todayUsd:1.2,monthUsd:4,dailyPercent:120,monthlyPercent:20,warning:false,exceeded:true,state:'exceeded',remainingTodayUsd:0,remainingMonthUsd:16,...overrides});

describe('applyCognitiveBudgetRouting',()=>{
 it('degrada deep a balanced y apaga deliberación',()=>{const result=applyCognitiveBudgetRouting(status(),route(),models);expect(result.applied).toBe(true);expect(result.route.tier).toBe('balanced');expect(result.route.model).toBe(models.balanced);expect(result.route.reasoning).toBe('medium');expect(result.deliberation).toBe('off');});
 it('degrada balanced y fast a la ruta rápida sin bajar más allá',()=>{expect(applyCognitiveBudgetRouting(status(),route('balanced'),models).route.tier).toBe('fast');expect(applyCognitiveBudgetRouting(status(),route('fast'),models).route.tier).toBe('fast');});
 it('no degrada en modo observación ni antes de exceder',()=>{expect(applyCognitiveBudgetRouting(status({enforcementMode:'observe'}),route(),models).applied).toBe(false);expect(applyCognitiveBudgetRouting(status({exceeded:false,state:'warning',warning:true}),route(),models).applied).toBe(false);});
 it('protege razonamiento alto explícito',()=>{const result=applyCognitiveBudgetRouting(status(),route(),models,true);expect(result.action).toBe('allow-protected');expect(result.route.tier).toBe('deep');});
 it.each(['salud y análisis de riesgo','seguridad operativa','asesoría legal','ingeniería de software'])('protege tareas críticas: %s',task=>{const result=applyCognitiveBudgetRouting(status(),route('deep',task),models);expect(result.action).toBe('allow-protected');expect(result.applied).toBe(false);});
 it('mantiene acceso web durante una degradación',()=>{const input={...route(),needsWeb:true};expect(applyCognitiveBudgetRouting(status(),input,models).route.needsWeb).toBe(true);});
});

describe('isBudgetProtectedTask',()=>{it('no protege consultas ordinarias',()=>{expect(isBudgetProtectedTask('consulta general')).toBe(false);expect(isBudgetProtectedTask('explicación técnica')).toBe(false);});});
