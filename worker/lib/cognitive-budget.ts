import {estimateModelCost} from './model-pricing';

export type CognitiveBudgetSettings={dailyLimitUsd:number;monthlyLimitUsd:number;warnPercent:number;enforcementMode:'observe'|'protect'};
export type CognitiveBudgetUsage={todayUsd:number;monthUsd:number};
export type CognitiveBudgetStatus=CognitiveBudgetSettings&CognitiveBudgetUsage&{dailyPercent:number;monthlyPercent:number;warning:boolean;exceeded:boolean;state:'ok'|'warning'|'exceeded';remainingTodayUsd:number;remainingMonthUsd:number};
export type CognitiveCostProjection={model:string;tier:'fast'|'balanced'|'deep';passes:1|2|3;estimatedInputTokens:number;estimatedOutputTokens:number;estimatedCostUsd:number;remainingTodayAfterUsd:number;remainingMonthAfterUsd:number;fitsDaily:boolean;fitsMonthly:boolean;fitsBudget:boolean;pricingKnown:boolean};
export type BudgetAction={action:'allow'|'allow-protected'|'degrade';reason:string};

export const DEFAULT_COGNITIVE_BUDGET:CognitiveBudgetSettings={dailyLimitUsd:1,monthlyLimitUsd:20,warnPercent:80,enforcementMode:'observe'};

const sensitiveTaskSignals=/\b(salud|m[eé]dic|dolor|s[ií]ntoma|dosis|cirug[ií]a|legal|demanda|contrato|seguridad|vulnerabilidad|secreto|token|contrase[nñ]a|finanzas personales|saldo|banco|inversi[oó]n)\b/i;
const OUTPUT_TOKENS_BY_TIER={fast:500,balanced:1200,deep:2400} as const;

function finiteNonNegative(value:unknown,fallback:number){const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?parsed:fallback;}
function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,value));}
export function normalizeCognitiveBudgetSettings(value:Partial<Record<keyof CognitiveBudgetSettings,unknown>>|null|undefined):CognitiveBudgetSettings{
 return{
  dailyLimitUsd:finiteNonNegative(value?.dailyLimitUsd,DEFAULT_COGNITIVE_BUDGET.dailyLimitUsd),
  monthlyLimitUsd:finiteNonNegative(value?.monthlyLimitUsd,DEFAULT_COGNITIVE_BUDGET.monthlyLimitUsd),
  warnPercent:clamp(finiteNonNegative(value?.warnPercent,DEFAULT_COGNITIVE_BUDGET.warnPercent),1,100),
  enforcementMode:value?.enforcementMode==='protect'?'protect':'observe'
 };
}
export function normalizeCognitiveBudgetUsage(value:Partial<Record<keyof CognitiveBudgetUsage,unknown>>|null|undefined):CognitiveBudgetUsage{return{todayUsd:finiteNonNegative(value?.todayUsd,0),monthUsd:finiteNonNegative(value?.monthUsd,0)};}
function percent(value:number,limit:number){if(limit<=0)return value>0?100:0;return Math.max(0,Math.round(value/limit*10000)/100);}
export function evaluateCognitiveBudget(settings:CognitiveBudgetSettings,usage:CognitiveBudgetUsage):CognitiveBudgetStatus{
 const safeSettings=normalizeCognitiveBudgetSettings(settings),safeUsage=normalizeCognitiveBudgetUsage(usage),dailyPercent=percent(safeUsage.todayUsd,safeSettings.dailyLimitUsd),monthlyPercent=percent(safeUsage.monthUsd,safeSettings.monthlyLimitUsd),peak=Math.max(dailyPercent,monthlyPercent),exceeded=dailyPercent>=100||monthlyPercent>=100,warning=!exceeded&&peak>=safeSettings.warnPercent;
 return{...safeSettings,...safeUsage,dailyPercent,monthlyPercent,warning,exceeded,state:exceeded?'exceeded':warning?'warning':'ok',remainingTodayUsd:Math.max(0,safeSettings.dailyLimitUsd-safeUsage.todayUsd),remainingMonthUsd:Math.max(0,safeSettings.monthlyLimitUsd-safeUsage.monthUsd)};
}
export function projectCognitiveCost(status:CognitiveBudgetStatus,model:string,tier:'fast'|'balanced'|'deep',inputChars:number,contextChars=0,passes:1|2|3=1):CognitiveCostProjection{
 const safeInputChars=Math.max(0,Number.isFinite(inputChars)?inputChars:0),safeContextChars=Math.max(0,Number.isFinite(contextChars)?contextChars:0),baseInputTokens=Math.max(1,Math.ceil((safeInputChars+safeContextChars+6000)/4)),baseOutputTokens=OUTPUT_TOKENS_BY_TIER[tier];
 const estimatedInputTokens=passes===1?baseInputTokens:passes===2?baseInputTokens*2:baseInputTokens*2+Math.min(16_000,baseInputTokens+baseOutputTokens*2);
 const estimatedOutputTokens=baseOutputTokens*passes;
 const estimate=estimateModelCost({input_tokens:estimatedInputTokens,output_tokens:estimatedOutputTokens},model),remainingTodayAfterUsd=status.dailyLimitUsd-status.todayUsd-estimate.costUsd,remainingMonthAfterUsd=status.monthlyLimitUsd-status.monthUsd-estimate.costUsd,fitsDaily=remainingTodayAfterUsd>=0,fitsMonthly=remainingMonthAfterUsd>=0;
 return{model,tier,passes,estimatedInputTokens,estimatedOutputTokens,estimatedCostUsd:estimate.costUsd,remainingTodayAfterUsd:Math.max(0,remainingTodayAfterUsd),remainingMonthAfterUsd:Math.max(0,remainingMonthAfterUsd),fitsDaily,fitsMonthly,fitsBudget:fitsDaily&&fitsMonthly,pricingKnown:estimate.pricingKnown};
}
export function isBudgetProtectedTask(input:string,task:string){return sensitiveTaskSignals.test(`${task} ${input}`);}
export function budgetAction(status:CognitiveBudgetStatus,sensitive=false,explicitHigh=false,projection?:CognitiveCostProjection|null):BudgetAction{
 if(status.enforcementMode!=='protect')return{action:'allow',reason:'presupuesto en observación; no modifica el router'};
 if(sensitive||explicitHigh)return{action:'allow-protected',reason:'tarea sensible o razonamiento alto explícito; no se degrada automáticamente'};
 if(status.exceeded)return{action:'degrade',reason:'presupuesto ya excedido en modo protección; usar ruta de menor costo'};
 if(projection&&!projection.fitsBudget)return{action:'degrade',reason:'el costo proyectado rebasaría el saldo diario o mensual disponible'};
 return{action:'allow',reason:projection?'la respuesta proyectada cabe dentro del presupuesto disponible':'presupuesto disponible'};
}
export function summarizeBudgetDecision(status:CognitiveBudgetStatus,action:BudgetAction,projection?:CognitiveCostProjection|null){return{state:status.state,enforcementMode:status.enforcementMode,dailyPercent:status.dailyPercent,monthlyPercent:status.monthlyPercent,action:action.action,reason:action.reason,projection:projection?{model:projection.model,tier:projection.tier,passes:projection.passes,estimatedInputTokens:projection.estimatedInputTokens,estimatedOutputTokens:projection.estimatedOutputTokens,estimatedCostUsd:projection.estimatedCostUsd,remainingTodayAfterUsd:projection.remainingTodayAfterUsd,remainingMonthAfterUsd:projection.remainingMonthAfterUsd,fitsBudget:projection.fitsBudget,pricingKnown:projection.pricingKnown}:null};}
export async function loadCognitiveBudget(db:D1Database,userId:string){
 const [row,usage]=await Promise.all([
  db.prepare('SELECT daily_limit_usd,monthly_limit_usd,warn_percent,enforcement_mode FROM cognitive_budgets WHERE user_id=?').bind(userId).first<any>(),
  db.prepare("SELECT COALESCE(SUM(CASE WHEN created_at>=date('now') THEN estimated_cost_usd ELSE 0 END),0) today_usd,COALESCE(SUM(CASE WHEN created_at>=datetime('now','start of month') THEN estimated_cost_usd ELSE 0 END),0) month_usd FROM api_usage WHERE user_id=?").bind(userId).first<any>()
 ]);
 const settings=normalizeCognitiveBudgetSettings(row?{dailyLimitUsd:row.daily_limit_usd,monthlyLimitUsd:row.monthly_limit_usd,warnPercent:row.warn_percent,enforcementMode:row.enforcement_mode}:DEFAULT_COGNITIVE_BUDGET);
 return evaluateCognitiveBudget(settings,normalizeCognitiveBudgetUsage({todayUsd:usage?.today_usd,monthUsd:usage?.month_usd}));
}
