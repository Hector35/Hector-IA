import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {budgetAction,loadCognitiveBudget} from '../lib/cognitive-budget';

export const cognitiveBudget=new Hono<{Bindings:Bindings;Variables:Variables}>();
cognitiveBudget.use('*',requireAuth);

cognitiveBudget.get('/',async c=>{const status=await loadCognitiveBudget(c.env.DB,c.get('userId'));return c.json({budget:status,policy:{ordinary:budgetAction(status,false,false),sensitive:budgetAction(status,true,false),explicitHigh:budgetAction(status,false,true)}});});

cognitiveBudget.put('/',async c=>{
 const parsed=z.object({dailyLimitUsd:z.number().min(0).max(1000),monthlyLimitUsd:z.number().min(0).max(10000),warnPercent:z.number().int().min(1).max(100),enforcementMode:z.enum(['observe','protect'])}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Presupuesto inválido',details:parsed.error.flatten()},400);
 const p=parsed.data,userId=c.get('userId');
 await c.env.DB.prepare(`INSERT INTO cognitive_budgets(user_id,daily_limit_usd,monthly_limit_usd,warn_percent,enforcement_mode,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(user_id) DO UPDATE SET daily_limit_usd=excluded.daily_limit_usd,monthly_limit_usd=excluded.monthly_limit_usd,warn_percent=excluded.warn_percent,enforcement_mode=excluded.enforcement_mode,updated_at=CURRENT_TIMESTAMP`).bind(userId,p.dailyLimitUsd,p.monthlyLimitUsd,p.warnPercent,p.enforcementMode).run();
 return c.json({budget:await loadCognitiveBudget(c.env.DB,userId)});
});
