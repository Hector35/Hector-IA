import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings} from '../types';
import {verifyGitHubActionsToken} from '../lib/github-oidc';

const schema=z.object({projectId:z.string().uuid(),version:z.number().int().min(1),status:z.enum(['success','failure','cancelled','skipped']),runId:z.string().regex(/^\d+$/)});
export const pwaRunnerStatus=new Hono<{Bindings:Bindings}>();

pwaRunnerStatus.post('/pwa-status',async c=>{
 try{
  const token=(c.req.header('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)throw new Error('OIDC requerido');
  await verifyGitHubActionsToken(token,'hector-os-pwa-runner');
  const parsed=schema.safeParse(await c.req.json());
  if(!parsed.success)return c.json({error:'Estado inválido'},400);
  const x=parsed.data,ok=x.status==='success';
  await c.env.DB.batch([
   c.env.DB.prepare('UPDATE pwa_project_versions SET build_status=?,build_run_id=? WHERE project_id=? AND version=?').bind(ok?'verified':'failed',x.runId,x.projectId,x.version),
   c.env.DB.prepare("UPDATE pwa_projects SET status=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(ok?'verified':'blocked',ok?null:`Build ${x.status}; run ${x.runId}`,x.projectId)
  ]);
  return c.json({ok:true,projectId:x.projectId,version:x.version,status:ok?'verified':'blocked'});
 }catch(e){return c.json({error:e instanceof Error?e.message:'Error'},401);}
});
