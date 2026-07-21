import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {budgetAction,isBudgetProtectedTask,loadCognitiveBudget,projectCognitiveCost,summarizeBudgetDecision} from '../lib/cognitive-budget';
import {aggregateBudgetSavings} from '../lib/budget-savings';
import {loadForecastContextChars} from '../lib/forecast-context';

export const cognitiveBudget=new Hono<{Bindings:Bindings;Variables:Variables}>();
cognitiveBudget.use('*',requireAuth);

async function loadBreakdown(db:D1Database,userId:string){
 const rows=(await db.prepare(`SELECT model,service,COUNT(*) requests,COALESCE(SUM(estimated_cost_usd),0) cost_usd,COALESCE(SUM(input_units),0) input_units,COALESCE(SUM(cached_input_units),0) cached_input_units,COALESCE(SUM(output_units),0) output_units
 FROM api_usage WHERE user_id=? AND created_at>=datetime('now','-30 days')
 GROUP BY model,service ORDER BY cost_usd DESC LIMIT 20`).bind(userId).all<any>()).results||[];
 return rows.map(row=>({model:String(row.model||'desconocido'),service:String(row.service||'general'),requests:Number(row.requests||0),costUsd:Number(row.cost_usd||0),inputUnits:Number(row.input_units||0),cachedInputUnits:Number(row.cached_input_units||0),outputUnits:Number(row.output_units||0)}));
}

async function loadSavings(db:D1Database,userId:string){
 const rows=(await db.prepare(`SELECT service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json
 FROM api_usage WHERE user_id=? AND created_at>=datetime('now','-30 days') ORDER BY created_at DESC LIMIT 1000`).bind(userId).all<any>()).results||[];
 return aggregateBudgetSavings(rows);
}

function modelForTier(env:Bindings,tier:'fast'|'balanced'|'deep'){return tier==='deep'?(env.OPENAI_MODEL_REASONING||env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL):tier==='balanced'?(env.OPENAI_MODEL_BALANCED||env.OPENAI_MODEL):(env.OPENAI_MODEL_FAST||env.OPENAI_MODEL);}

cognitiveBudget.get('/',async c=>{const userId=c.get('userId'),[status,breakdown,savings]=await Promise.all([loadCognitiveBudget(c.env.DB,userId),loadBreakdown(c.env.DB,userId),loadSavings(c.env.DB,userId)]);return c.json({budget:status,policy:{ordinary:budgetAction(status,false,false),sensitive:budgetAction(status,true,false),explicitHigh:budgetAction(status,false,true)},breakdown,savings});});

cognitiveBudget.post('/forecast',async c=>{
 const parsed=z.object({prompt:z.string().min(1).max(12000),task:z.string().min(1).max(120).default('consulta general'),tier:z.enum(['fast','balanced','deep']),contextChars:z.number().int().min(0).max(500000).default(0),passes:z.union([z.literal(1),z.literal(2),z.literal(3)]).default(1),explicitHigh:z.boolean().default(false),model:z.string().min(1).max(120).optional()}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Pronóstico inválido',details:parsed.error.flatten()},400);
 const p=parsed.data,userId=c.get('userId'),[status,contextChars]=await Promise.all([loadCognitiveBudget(c.env.DB,userId),loadForecastContextChars(c.env.DB,userId,p.contextChars)]),model=p.model||modelForTier(c.env,p.tier),projection=projectCognitiveCost(status,model,p.tier,p.prompt.length,contextChars,p.passes),sensitive=isBudgetProtectedTask(p.prompt,p.task),action=budgetAction(status,sensitive,p.explicitHigh,projection);
 return c.json({forecast:summarizeBudgetDecision(status,action,projection),protected:sensitive,model,tier:p.tier,contextChars,note:'Estimación previa con contexto reciente del propietario; el costo real depende de tokens, herramientas, caché y longitud final. El texto del pronóstico no se persiste.'});
});

cognitiveBudget.put('/',async c=>{
 const parsed=z.object({dailyLimitUsd:z.number().min(0).max(1000),monthlyLimitUsd:z.number().min(0).max(10000),warnPercent:z.number().int().min(1).max(100),enforcementMode:z.enum(['observe','protect'])}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Presupuesto inválido',details:parsed.error.flatten()},400);
 const p=parsed.data,userId=c.get('userId');
 await c.env.DB.prepare(`INSERT INTO cognitive_budgets(user_id,daily_limit_usd,monthly_limit_usd,warn_percent,enforcement_mode,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(user_id) DO UPDATE SET daily_limit_usd=excluded.daily_limit_usd,monthly_limit_usd=excluded.monthly_limit_usd,warn_percent=excluded.warn_percent,enforcement_mode=excluded.enforcement_mode,updated_at=CURRENT_TIMESTAMP`).bind(userId,p.dailyLimitUsd,p.monthlyLimitUsd,p.warnPercent,p.enforcementMode).run();
 return c.json({budget:await loadCognitiveBudget(c.env.DB,userId)});
});
