import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings} from '../types';
import {verifyGitHubActionsToken} from '../lib/github-oidc';

const audience='hector-os-evidence';
const evidenceSchema=z.object({
  jobId:z.string().uuid().optional(),
  userId:z.string().uuid().optional(),
  source:z.enum(['agent-browser','merge-smoke','production-smoke']),
  url:z.string().url().max(2000),
  title:z.string().max(500).optional(),
  status:z.number().int().min(0).max(599).nullable().optional(),
  errors:z.array(z.string().max(2000)).max(100).default([]),
  runId:z.string().max(40).optional(),
  screenshotBase64:z.string().max(8_000_000).optional()
});

function decodeBase64(value:string){
  const raw=atob(value.replace(/^data:image\/png;base64,/,''));
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}

export const evidence=new Hono<{Bindings:Bindings}>();

evidence.post('/browser',async c=>{
  try{
    const token=(c.req.header('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
    if(!token)throw new Error('OIDC requerido');
    await verifyGitHubActionsToken(token,audience);
    const parsed=evidenceSchema.safeParse(await c.req.json());
    if(!parsed.success)return c.json({error:'Evidencia inválida',details:parsed.error.flatten()},400);
    const x=parsed.data,id=crypto.randomUUID(),prefix=`evidence/${x.jobId||'system'}/${id}`;
    const reportKey=`${prefix}/report.json`,screenshotKey=x.screenshotBase64?`${prefix}/page.png`:null;
    const report={id,jobId:x.jobId||null,userId:x.userId||null,source:x.source,url:x.url,title:x.title||null,status:x.status??null,errors:x.errors,runId:x.runId||null,createdAt:new Date().toISOString()};
    await c.env.FILES.put(reportKey,JSON.stringify(report,null,2),{httpMetadata:{contentType:'application/json'}});
    if(screenshotKey&&x.screenshotBase64)await c.env.FILES.put(screenshotKey,decodeBase64(x.screenshotBase64),{httpMetadata:{contentType:'image/png'}});
    await c.env.DB.prepare('INSERT INTO browser_evidence(id,user_id,job_id,source,url,title,http_status,errors_json,report_key,screenshot_key,run_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,x.userId||null,x.jobId||null,x.source,x.url,x.title||null,x.status??null,JSON.stringify(x.errors),reportKey,screenshotKey,x.runId||null).run();
    if(x.jobId)await c.env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)').bind(crypto.randomUUID(),x.jobId,`Evidencia de navegador guardada: HTTP ${x.status??'desconocido'}, ${x.errors.length} errores`,95).run();
    return c.json({ok:true,id,reportKey,screenshotKey});
  }catch(error){return c.json({error:error instanceof Error?error.message:'Error de evidencia'},401);}
});
