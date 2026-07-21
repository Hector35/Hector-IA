export type CognitiveBudgetSettings={dailyLimitUsd:number;monthlyLimitUsd:number;warnPercent:number;enforcementMode:'observe'|'protect'};
export type CognitiveBudgetUsage={todayUsd:number;monthUsd:number};
export type CognitiveBudgetStatus=CognitiveBudgetSettings&CognitiveBudgetUsage&{dailyPercent:number;monthlyPercent:number;warning:boolean;exceeded:boolean;state:'ok'|'warning'|'exceeded';remainingTodayUsd:number;remainingMonthUsd:number};
export type BudgetAction={action:'allow'|'allow-protected'|'degrade';reason:string};

export const DEFAULT_COGNITIVE_BUDGET:CognitiveBudgetSettings={dailyLimitUsd:1,monthlyLimitUsd:20,warnPercent:80,enforcementMode:'observe'};

const sensitiveTaskSignals=/\b(salud|m[eé]dic|dolor|s[ií]ntoma|dosis|cirug[ií]a|legal|demanda|contrato|seguridad|vulnerabilidad|secreto|token|contrase[nñ]a|finanzas personales|saldo|banco|inversi[oó]n)\b/i;

function percent(value:number,limit:number){if(limit<=0)return value>0?100:0;return Math.max(0,Math.round(value/limit*10000)/100);}
export function evaluateCognitiveBudget(settings:CognitiveBudgetSettings,usage:CognitiveBudgetUsage):CognitiveBudgetStatus{
 const dailyPercent=percent(usage.todayUsd,settings.dailyLimitUsd),monthlyPercent=percent(usage.monthUsd,settings.monthlyLimitUsd),peak=Math.max(dailyPercent,monthlyPercent),exceeded=dailyPercent>=100||monthlyPercent>=100,warning=!exceeded&&peak>=settings.warnPercent;
 return{...settings,...usage,dailyPercent,monthlyPercent,warning,exceeded,state:exceeded?'exceeded':warning?'warning':'ok',remainingTodayUsd:Math.max(0,settings.dailyLimitUsd-usage.todayUsd),remainingMonthUsd:Math.max(0,settings.monthlyLimitUsd-usage.monthUsd)};
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
 const settings:CognitiveBudgetSettings=row?{dailyLimitUsd:Number(row.daily_limit_usd),monthlyLimitUsd:Number(row.monthly_limit_usd),warnPercent:Number(row.warn_percent),enforcementMode:row.enforcement_mode}:DEFAULT_COGNITIVE_BUDGET;
 return evaluateCognitiveBudget(settings,{todayUsd:Number(usage?.today_usd||0),monthUsd:Number(usage?.month_usd||0)});
}
