import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {loadCloudflareHealth,PROVIDER_HEALTH_POLICY} from '../lib/provider-quality';

export const providerHealth=new Hono<{Bindings:Bindings;Variables:Variables}>();
providerHealth.use('*',requireAuth);

providerHealth.get('/',async c=>{
 const cloudflare=await loadCloudflareHealth(c.env.DB);
 try{
  const result=await c.env.DB.prepare(`SELECT requested_provider,actual_provider,COUNT(*) samples,
   ROUND(AVG(score),1) average_score,ROUND(AVG(latency_ms),0) average_latency_ms,
   SUM(accepted) accepted_count,SUM(fallback) fallback_count,MAX(created_at) last_event_at
   FROM provider_quality_events WHERE created_at>=datetime('now',?)
   GROUP BY requested_provider,actual_provider ORDER BY requested_provider,actual_provider`)
   .bind(`-${PROVIDER_HEALTH_POLICY.windowHours} hours`).all();
  return c.json({available:true,contentStored:false,policy:PROVIDER_HEALTH_POLICY,cloudflare,routes:result.results||[]});
 }catch{
  return c.json({available:false,contentStored:false,policy:PROVIDER_HEALTH_POLICY,cloudflare,routes:[],reason:'La migración de telemetría aún no está aplicada'});
 }
});
