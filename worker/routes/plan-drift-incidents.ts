import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {latestActions,normalizeDriftIncident} from '../lib/plan-drift-incidents';

export const planDriftIncidents=new Hono<{Bindings:Bindings;Variables:Variables}>();
planDriftIncidents.use('*',requireAuth);

planDriftIncidents.get('/',async c=>{
 const userId=c.get('userId');
 const [drifts,actions]=await Promise.all([
  c.env.DB.prepare("SELECT id,model,estimated_cost_usd,metadata_json,created_at FROM api_usage WHERE user_id=? AND service='policy-drift-blocked' ORDER BY created_at DESC LIMIT 100").bind(userId).all(),
  c.env.DB.prepare("SELECT metadata_json FROM api_usage WHERE user_id=? AND service='policy-drift-action' ORDER BY created_at DESC LIMIT 300").bind(userId).all()
 ]);
 const actionMap=latestActions((actions.results||[]) as any[]),items=(drifts.results||[]).map(row=>normalizeDriftIncident(row,actionMap)).filter(Boolean);
 return c.json({items,active:items.filter((item:any)=>item.status==='active').length});
});

planDriftIncidents.post('/:id/action',async c=>{
 const parsed=z.object({action:z.enum(['acknowledged','recovery-requested']),reason:z.string().trim().min(3).max(400)}).safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Acción inválida'},400);
 const userId=c.get('userId'),incident=await c.env.DB.prepare("SELECT id FROM api_usage WHERE id=? AND user_id=? AND service='policy-drift-blocked'").bind(c.req.param('id'),userId).first();
 if(!incident)return c.json({error:'Incidente no encontrado'},404);
 await c.env.DB.prepare("INSERT INTO api_usage(id,user_id,provider,service,model,input_units,cached_input_units,output_units,estimated_cost_usd,metadata_json) VALUES(?,?,'system','policy-drift-action','governance',0,0,0,0,?)").bind(crypto.randomUUID(),userId,JSON.stringify({incidentId:c.req.param('id'),action:parsed.data.action,reason:parsed.data.reason})).run();
 return c.json({ok:true,status:parsed.data.action});
});
