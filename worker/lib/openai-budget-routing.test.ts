import {describe,expect,it} from 'vitest';
import type {Bindings} from '../types';
import {applyBudgetRouting,type Route} from './openai';
import {evaluateCognitiveBudget} from './cognitive-budget';

const env={OPENAI_MODEL:'gpt-5.6-terra',OPENAI_MODEL_FAST:'gpt-5.6-luna',OPENAI_MODEL_BALANCED:'gpt-5.6-terra',OPENAI_MODEL_REASONING:'gpt-5.6-sol'} as Bindings;
const exceeded=evaluateCognitiveBudget({dailyLimitUsd:1,monthlyLimitUsd:20,warnPercent:80,enforcementMode:'protect'},{todayUsd:1.2,monthUsd:4});
const route=(tier:Route['tier']):Route=>({tier,model:tier==='deep'?'gpt-5.6-sol':tier==='balanced'?'gpt-5.6-terra':'gpt-5.6-luna',reasoning:tier==='deep'?'high':tier==='balanced'?'medium':'low',reason:'ruta original',task:'consulta general',needsWeb:false});

describe('applyBudgetRouting',()=>{
 it('baja Sol a Terra en tareas ordinarias',()=>{const out=applyBudgetRouting(env,route('deep'),'resume este documento',{},exceeded);expect(out.route.tier).toBe('balanced');expect(out.route.model).toBe('gpt-5.6-terra');expect(out.decision.action).toBe('degrade');});
 it('baja Terra a Luna en tareas ordinarias',()=>{const out=applyBudgetRouting(env,route('balanced'),'explica algo breve',{},exceeded);expect(out.route.tier).toBe('fast');expect(out.route.model).toBe('gpt-5.6-luna');});
 it('preserva salud y razonamiento alto explícito',()=>{expect(applyBudgetRouting(env,route('deep'),'tengo dolor intenso',{},exceeded).route.tier).toBe('deep');expect(applyBudgetRouting(env,route('deep'),'audita esto',{reasoning:'high'},exceeded).route.tier).toBe('deep');});
 it('no degrada mientras el presupuesto solo observa',()=>{const observe={...exceeded,enforcementMode:'observe' as const};expect(applyBudgetRouting(env,route('deep'),'resume esto',{},observe).route.tier).toBe('deep');});
 it('mantiene Luna y registra que ya usa la ruta mínima',()=>{const out=applyBudgetRouting(env,route('fast'),'hola',{},exceeded);expect(out.route.tier).toBe('fast');expect(out.route.reason).toMatch(/ruta mínima/);});
});
