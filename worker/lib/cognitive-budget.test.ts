import {describe,expect,it} from 'vitest';
import {budgetAction,evaluateCognitiveBudget,forecastCalibration,isBudgetProtectedTask,normalizeCognitiveBudgetSettings,normalizeCognitiveBudgetUsage,projectCognitiveCost,summarizeBudgetDecision,type CognitiveBudgetStatus} from './cognitive-budget';

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

describe('forecastCalibration',()=>{
 const base=evaluateCognitiveBudget(settings,{todayUsd:.2,monthUsd:3});
 it('prioriza una calibración específica del modelo con cinco muestras',()=>{
  const status={...base,forecastAccuracy:{sampleCount:12,meanAbsolutePercentError:20,biasPercent:-15,medianRatio:1.3,recommendedMultiplier:1.3,calibrationReady:true,byModel:[{model:'gpt-5.6-terra',sampleCount:6,meanAbsolutePercentError:10,biasPercent:-20,medianRatio:1.5,recommendedMultiplier:1.5}]}} as CognitiveBudgetStatus;
  expect(forecastCalibration(status,'gpt-5.6-terra')).toEqual({multiplier:1.5,sampleCount:6,specificToModel:true,source:'model'});
 });
 it('usa calibración global cuando el modelo no tiene suficientes muestras',()=>{
  const status={...base,forecastAccuracy:{sampleCount:8,meanAbsolutePercentError:20,biasPercent:-10,medianRatio:1.25,recommendedMultiplier:1.25,calibrationReady:true,byModel:[]}} as CognitiveBudgetStatus;
  expect(forecastCalibration(status,'gpt-5.6-sol')).toEqual({multiplier:1.25,sampleCount:8,specificToModel:false,source:'global'});
 });
 it('mantiene multiplicador neutro con poca evidencia',()=>expect(forecastCalibration({...base,forecastAccuracy:{sampleCount:4,meanAbsolutePercentError:0,biasPercent:0,medianRatio:1.8,recommendedMultiplier:1,calibrationReady:false,byModel:[]}},'gpt-5.6-luna').multiplier).toBe(1));
});

describe('projectCognitiveCost',()=>{
 const available=evaluateCognitiveBudget(settings,{todayUsd:.2,monthUsd:3});
 it('proyecta más costo para deliberación de tres pasadas que para una respuesta simple',()=>{
  const single=projectCognitiveCost(available,'gpt-5.6-terra','balanced',800,4000,1),ensemble=projectCognitiveCost(available,'gpt-5.6-terra','balanced',800,4000,3);
  expect(ensemble.estimatedInputTokens).toBeGreaterThan(single.estimatedInputTokens);
  expect(ensemble.estimatedOutputTokens).toBeGreaterThan(single.estimatedOutputTokens);
  expect(ensemble.estimatedCostUsd).toBeGreaterThan(single.estimatedCostUsd);
 });
 it('aplica el multiplicador histórico antes de decidir si cabe',()=>{
  const calibrated={...available,forecastAccuracy:{sampleCount:7,meanAbsolutePercentError:30,biasPercent:-50,medianRatio:2,recommendedMultiplier:2,calibrationReady:true,byModel:[]}},projection=projectCognitiveCost(calibrated,'gpt-5.6-terra','balanced',800,4000,1);
  expect(projection.estimatedCostUsd).toBeCloseTo(projection.baseEstimatedCostUsd*2,10);
  expect(projection.calibration).toMatchObject({multiplier:2,source:'global'});
 });
 it('calcula el saldo posterior y detecta cuando la respuesta no cabe',()=>{
  const tight=evaluateCognitiveBudget({...settings,dailyLimitUsd:.01},{todayUsd:.009,monthUsd:1}),projection=projectCognitiveCost(tight,'gpt-5.6-sol','deep',4000,12000,3);
  expect(projection.fitsDaily).toBe(false);
  expect(projection.fitsBudget).toBe(false);
  expect(projection.remainingTodayAfterUsd).toBe(0);
 });
});

describe('budgetAction',()=>{
 const exceeded=evaluateCognitiveBudget(settings,{todayUsd:1.2,monthUsd:3});
 it('degrada solamente tareas ordinarias',()=>expect(budgetAction(exceeded,false,false).action).toBe('degrade'));
 it('preserva tareas sensibles y solicitudes explícitas de alta inteligencia',()=>{expect(budgetAction(exceeded,true,false).action).toBe('allow-protected');expect(budgetAction(exceeded,false,true).action).toBe('allow-protected');});
 it('no aplica cambios en modo observación',()=>expect(budgetAction({...exceeded,enforcementMode:'observe'},false,false).action).toBe('allow'));
 it('degrada antes de exceder cuando la proyección no cabe',()=>{
  const available=evaluateCognitiveBudget(settings,{todayUsd:.99,monthUsd:3}),projection=projectCognitiveCost(available,'gpt-5.6-sol','deep',5000,10000,3);
  expect(available.exceeded).toBe(false);
  expect(budgetAction(available,false,false,projection).action).toBe('degrade');
 });
 it('permite una respuesta proyectada que cabe dentro del saldo',()=>{
  const available=evaluateCognitiveBudget(settings,{todayUsd:.1,monthUsd:3}),projection=projectCognitiveCost(available,'gpt-5.6-luna','fast',100,0,1);
  expect(budgetAction(available,false,false,projection).action).toBe('allow');
 });
 it('resume una decisión sin contenido privado e incluye la calibración',()=>{
  const projection=projectCognitiveCost(exceeded,'gpt-5.6-terra','balanced',500,1000,1);
  expect(summarizeBudgetDecision(exceeded,budgetAction(exceeded,false,false,projection),projection)).toMatchObject({state:'exceeded',action:'degrade',dailyPercent:120,projection:{model:'gpt-5.6-terra',passes:1,calibration:{multiplier:1,source:'none'}}});
 });
});

describe('isBudgetProtectedTask',()=>{
 it('protege salud, seguridad, legal y finanzas personales',()=>{expect(isBudgetProtectedTask('Tengo dolor intenso','consulta general')).toBe(true);expect(isBudgetProtectedTask('audita una vulnerabilidad','ingeniería de software')).toBe(true);expect(isBudgetProtectedTask('revisa mi saldo','finanzas personales')).toBe(true);});
 it('permite ahorro en tareas ordinarias',()=>expect(isBudgetProtectedTask('resume este texto','consulta general')).toBe(false));
});
