import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {budgetAction,isBudgetProtectedTask,loadCognitiveBudget,projectCognitiveCost,summarizeBudgetDecision} from '../lib/cognitive-budget';
import {aggregateBudgetSavings} from '../lib/budget-savings';
import {loadForecastContextChars} from '../lib/forecast-context';
import {loadForecastAccuracy} from '../lib/forecast-accuracy';
import {loadBudgetQualityOverview,loadBudgetQualityPolicy} from '../lib/budget-quality-breaker';
import {loadBudgetQualityGovernance,normalizeBudgetQualityGovernanceMode} from '../lib/budget-quality-governance';

export const cognitiveBudget=new Hono<{Bindings:Bindings;Variables:Variables}>();
cognitiveBudget.use('*',requireAuth);

async function loadBreakdown(db:D1Database,userId:string){
 const rows=(await db.prepare(`SELECT model,service,COUNT(*) requests,COALESCE(SUM(estimated_cost_usd),0) cost_usd,COALESCE(SUM(input_units),0) input_units,COALESCE(SUM(cached_input_units),0) cached_input_units,COALESCE(SUM(output_units),0) output_units FROM api_usage WHERE user_id=? AND created_at>=datetime('now','-30 days') GROUP BY model,service ORDER BY cost_usd DESC LIMIT 20`).bind(userId).all<any>()).results||[];
 return rows.map(row=>({model:String(row.model||'desconocido'),service:String(row.service||'general'),requests:Number(row.requests||0),costUsd:Number(row.cost_usd||0),inputUnits:Number(row.input_units||0),cachedInputUnits:Number(row.cached_input_units||0),outputUnits:Number(row.output_units||0)}));
}
async function loadSavings(db:D1Database,userId:string){const rows=(await db.prepare(`SELECT service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json FROM api_usage WHERE user_id=? AND created_at>=datetime('now','-30 days') ORDER BY created_at DESC LIMIT 1000`).bind(userId).all<any>()).results||[];return aggregateBudgetSavings(rows);}
function modelForTier(env:Bindings,tier:'fast'|'balanced'|'deep'){return tier==='deep'?(env.OPENAI_MODEL_REASONING||env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL):tier==='balanced'?(env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL):(env.OPENAI_MODEL_FAST||env.OPENAI_MODEL);}

cognitiveBudget.get('/',async c=>{const userId=c.get('userId'),[status,breakdown,savings,forecastAccuracy,qualityByCategory]=await Promise.all([loadCognitiveBudget(c.env.DB,userId),loadBreakdown(c.env.DB,userId),loadSavings(c.env.DB,userId),loadForecastAccuracy(c.env.DB,userId),loadBudgetQualityOverview(c.env.DB,userId)]);return c.json({budget:status,policy:{ordinary:budgetAction(status,false,false),sensitive:budgetAction(status,true,false),explicitHigh:budgetAction(status,false,true)},breakdown,savings,forecastAccuracy,qualityByCategory,contentStored:false});});

cognitiveBudget.get('/quality-governance/events',async c=>{
 const raw=Number(c.req.query('limit')||30),limit=Math.max(1,Math.min(100,Number.isFinite(raw)?raw:30));
 const rows=(await c.env.DB.prepare('SELECT id,task,previous_mode previousMode,next_mode nextMode,reason,created_at createdAt FROM budget_quality_governance_events WHERE user_id=? ORDER BY created_at DESC LIMIT ?').bind(c.get('userId'),limit).all()).results||[];
 return c.json({items:rows,contentStored:false});
});

cognitiveBudget.put('/quality-governance/:task',async c=>{
 const parsed=z.object({mode:z.enum(['auto','protect','probe','allow']),reason:z.string().trim().min(3).max(300)}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Gobierno inválido',details:parsed.error.flatten()},400);
 const task=decodeURIComponent(c.req.param('task')).trim().slice(0,120);if(!task)return c.json({error:'Categoría inválida'},400);
 const userId=c.get('userId'),current=await loadBudgetQualityGovernance(c.env.DB,userId,task),nextMode=normalizeBudgetQualityGovernanceMode(parsed.data.mode),id=crypto.randomUUID();
 await c.env.DB.batch([
  c.env.DB.prepare(`INSERT INTO budget_quality_governance(user_id,task,mode,reason,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
   ON CONFLICT(user_id,task) DO UPDATE SET mode=excluded.mode,reason=excluded.reason,updated_at=CURRENT_TIMESTAMP`).bind(userId,task,nextMode,parsed.data.reason),
  c.env.DB.prepare('INSERT INTO budget_quality_governance_events(id,user_id,task,previous_mode,next_mode,reason) VALUES(?,?,?,?,?,?)').bind(id,userId,task,current.mode,nextMode,parsed.data.reason)
 ]);
 return c.json({ok:true,task,governance:await loadBudgetQualityGovernance(c.env.DB,userId,task),policy:await loadBudgetQualityPolicy(c.env.DB,userId,task)});
});

cognitiveBudget.post('/forecast',async c=>{
 const parsed=z.object({prompt:z.string().min(1).max(12000),task:z.string().min(1).max(120).default('consulta general'),tier:z.enum(['fast','balanced','deep']),contextChars:z.number().int().min(0).max(500000).default(0),passes:z.union([z.literal(1),z.literal(2),z.literal(3)]).default(1),explicitHigh:z.boolean().default(false),model:z.string().min(1).max(120).optional()}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Pronóstico inválido',details:parsed.error.flatten()},400);
 const p=parsed.data,userId=c.get('userId'),[status,contextChars,accuracy]=await Promise.all([loadCognitiveBudget(c.env.DB,userId),loadForecastContextChars(c.env.DB,userId,p.contextChars),loadForecastAccuracy(c.env.DB,userId)]),model=p.model||modelForTier(c.env,p.tier),baseProjection=projectCognitiveCost(status,model,p.tier,p.prompt.length,contextChars,p.passes),modelCalibration=accuracy.byModel.find(x=>x.model===model),multiplier=modelCalibration&&modelCalibration.sampleCount>=5?modelCalibration.recommendedMultiplier:accuracy.recommendedMultiplier,projection={...baseProjection,estimatedCostUsd:baseProjection.estimatedCostUsd*multiplier,remainingTodayAfterUsd:Math.max(0,status.dailyLimitUsd-status.todayUsd-baseProjection.estimatedCostUsd*multiplier),remainingMonthAfterUsd:Math.max(0,status.monthlyLimitUsd-status.monthUsd-baseProjection.estimatedCostUsd*multiplier)},sensitive=isBudgetProtectedTask(p.prompt,p.task),action=budgetAction(status,sensitive,p.explicitHigh,{...projection,fitsDaily:status.dailyLimitUsd-status.todayUsd-projection.estimatedCostUsd>=0,fitsMonthly:status.monthlyLimitUsd-status.monthUsd-projection.estimatedCostUsd>=0,fitsBudget:status.dailyLimitUsd-status.todayUsd-projection.estimatedCostUsd>=0&&status.monthlyLimitUsd-status.monthUsd-projection.estimatedCostUsd>=0});
 return c.json({forecast:summarizeBudgetDecision(status,action,{...projection,fitsDaily:status.dailyLimitUsd-status.todayUsd-projection.estimatedCostUsd>=0,fitsMonthly:status.monthlyLimitUsd-status.monthUsd-projection.estimatedCostUsd>=0,fitsBudget:status.dailyLimitUsd-status.todayUsd-projection.estimatedCostUsd>=0&&status.monthlyLimitUsd-status.monthUsd-projection.estimatedCostUsd>=0}),protected:sensitive,model,tier:p.tier,contextChars,calibration:{applied:multiplier!==1,multiplier,sampleCount:modelCalibration?.sampleCount||accuracy.sampleCount,modelSpecific:!!modelCalibration&&modelCalibration.sampleCount>=5},note:'Estimación previa calibrada con errores agregados de los últimos 30 días cuando existen al menos cinco muestras. No se persiste el texto.'});
});

cognitiveBudget.put('/',async c=>{const parsed=z.object({dailyLimitUsd:z.number().min(0).max(1000),monthlyLimitUsd:z.number().min(0).max(10000),warnPercent:z.number().int().min(1).max(100),enforcementMode:z.enum(['observe','protect'])}).safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Presupuesto inválido',details:parsed.error.flatten()},400);const p=parsed.data,userId=c.get('userId');await c.env.DB.prepare(`INSERT INTO cognitive_budgets(user_id,daily_limit_usd,monthly_limit_usd,warn_percent,enforcement_mode,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET daily_limit_usd=excluded.daily_limit_usd,monthly_limit_usd=excluded.monthly_limit_usd,warn_percent=excluded.warn_percent,enforcement_mode=excluded.enforcement_mode,updated_at=CURRENT_TIMESTAMP`).bind(userId,p.dailyLimitUsd,p.monthlyLimitUsd,p.warnPercent,p.enforcementMode).run();return c.json({budget:await loadCognitiveBudget(c.env.DB,userId)});});
