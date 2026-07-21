export type CognitiveBudgetSettings={dailyLimitUsd:number;monthlyLimitUsd:number;warnPercent:number;enforcementMode:'observe'|'protect'};
export type CognitiveBudgetUsage={todayUsd:number;monthUsd:number};
export type CognitiveBudgetStatus=CognitiveBudgetSettings&CognitiveBudgetUsage&{dailyPercent:number;monthlyPercent:number;warning:boolean;exceeded:boolean;state:'ok'|'warning'|'exceeded';remainingTodayUsd:number;remainingMonthUsd:number};
export type BudgetAction={action:'allow'|'allow-protected'|'degrade';reason:string};

export const DEFAULT_COGNITIVE_BUDGET:CognitiveBudgetSettings={dailyLimitUsd:1,monthlyLimitUsd:20,warnPercent:80,enforcementMode:'observe'};

const sensitiveTaskSignals=/\b(salud|m[eé]dic|dolor|s[ií]ntoma|dosis|cirug[ií]a|legal|demanda|contrato|seguridad|vulnerabilidad|secreto|token|contrase[nñ]a|finanzas personales|saldo|banco|inversi[oó]n)\b/i;

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
export function isBudgetProtectedTask(input:string,task:string){return sensitiveTaskSignals.test(`${task} ${input}`);}
export function budgetAction(status:CognitiveBudgetStatus,sensitive=false,explicitHigh=false):BudgetAction{
 if(status.enforcementMode!=='protect'||!status.exceeded)return{action:'allow',reason:'presupuesto en observación o disponible'};
 if(sensitive||explicitHigh)return{action:'allow-protected',reason:'tarea sensible o razonamiento alto explícito; no se degrada automáticamente'};
 return{action:'degrade',reason:'presupuesto excedido en modo protección; usar ruta de menor costo'};
}
export function summarizeBudgetDecision(status:CognitiveBudgetStatus,action:BudgetAction){return{state:status.state,enforcementMode:status.enforcementMode,dailyPercent:status.dailyPercent,monthlyPercent:status.monthlyPercent,action:action.action,reason:action.reason};}
export async function loadCognitiveBudget(db:D1Database,userId:string){
 const [row,usage]=await Promise.all([
  db.prepare('SELECT daily_limit_usd,monthly_limit_usd,warn_percent,enforcement_mode FROM cognitive_budgets WHERE user_id=?').bind(userId).first<any>(),
  db.prepare("SELECT COALESCE(SUM(CASE WHEN created_at>=date('now') THEN estimated_cost_usd ELSE 0 END),0) today_usd,COALESCE(SUM(CASE WHEN created_at>=datetime('now','start of month') THEN estimated_cost_usd ELSE 0 END),0) month_usd FROM api_usage WHERE user_id=?").bind(userId).first<any>()
 ]);
 const settings=normalizeCognitiveBudgetSettings(row?{dailyLimitUsd:row.daily_limit_usd,monthlyLimitUsd:row.monthly_limit_usd,warnPercent:row.warn_percent,enforcementMode:row.enforcement_mode}:DEFAULT_COGNITIVE_BUDGET);
 return evaluateCognitiveBudget(settings,normalizeCognitiveBudgetUsage({todayUsd:usage?.today_usd,monthUsd:usage?.month_usd}));
}
