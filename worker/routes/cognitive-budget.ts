import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {budgetAction,loadCognitiveBudget} from '../lib/cognitive-budget';

export const cognitiveBudget=new Hono<{Bindings:Bindings;Variables:Variables}>();
cognitiveBudget.use('*',requireAuth);

async function loadBreakdown(db:D1Database,userId:string){
 const rows=(await db.prepare(`SELECT model,service,COUNT(*) requests,COALESCE(SUM(estimated_cost_usd),0) cost_usd,COALESCE(SUM(input_units),0) input_units,COALESCE(SUM(cached_input_units),0) cached_input_units,COALESCE(SUM(output_units),0) output_units
 FROM api_usage WHERE user_id=? AND created_at>=datetime('now','-30 days')
 GROUP BY model,service ORDER BY cost_usd DESC LIMIT 20`).bind(userId).all<any>()).results||[];
 return rows.map(row=>({model:String(row.model||'desconocido'),service:String(row.service||'general'),requests:Number(row.requests||0),costUsd:Number(row.cost_usd||0),inputUnits:Number(row.input_units||0),cachedInputUnits:Number(row.cached_input_units||0),outputUnits:Number(row.output_units||0)}));
}

cognitiveBudget.get('/',async c=>{const userId=c.get('userId'),[status,breakdown]=await Promise.all([loadCognitiveBudget(c.env.DB,userId),loadBreakdown(c.env.DB,userId)]);return c.json({budget:status,policy:{ordinary:budgetAction(status,false,false),sensitive:budgetAction(status,true,false),explicitHigh:budgetAction(status,false,true)},breakdown});});

cognitiveBudget.put('/',async c=>{
 const parsed=z.object({dailyLimitUsd:z.number().min(0).max(1000),monthlyLimitUsd:z.number().min(0).max(10000),warnPercent:z.number().int().min(1).max(100),enforcementMode:z.enum(['observe','protect'])}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Presupuesto inválido',details:parsed.error.flatten()},400);
 const p=parsed.data,userId=c.get('userId');
 await c.env.DB.prepare(`INSERT INTO cognitive_budgets(user_id,daily_limit_usd,monthly_limit_usd,warn_percent,enforcement_mode,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(user_id) DO UPDATE SET daily_limit_usd=excluded.daily_limit_usd,monthly_limit_usd=excluded.monthly_limit_usd,warn_percent=excluded.warn_percent,enforcement_mode=excluded.enforcement_mode,updated_at=CURRENT_TIMESTAMP`).bind(userId,p.dailyLimitUsd,p.monthlyLimitUsd,p.warnPercent,p.enforcementMode).run();
 return c.json({budget:await loadCognitiveBudget(c.env.DB,userId)});
});
