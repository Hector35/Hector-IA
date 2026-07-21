import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings} from '../types';
import {verifyGitHubActionsToken} from '../lib/github-oidc';
import {browserVerificationError,canTransitionBrowserVerification,resolveBrowserVerificationOutcome,type BrowserVerificationStatus} from '../lib/browser-verification';

const audience='hector-os-evidence';
const evidenceSchema=z.object({
  verificationId:z.string().uuid().optional(),
  verificationStatus:z.enum(['completed','failed']).optional(),
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
const statusSchema=z.object({
  verificationId:z.string().uuid(),
  jobId:z.string().uuid(),
  userId:z.string().uuid().optional(),
  status:z.enum(['running','failed']),
  runId:z.string().max(40).optional(),
  error:z.string().max(1000).optional()
});

type VerificationRow={id:string;job_id:string;user_id:string;status:BrowserVerificationStatus;evidence_id:string|null;progress:number};
type ExistingEvidence={id:string;report_key:string|null;screenshot_key:string|null;file_id:string|null};

function decodeBase64(value:string){
  const raw=atob(value.replace(/^data:image\/png;base64,/,''));
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}

export function evidenceFileName(title:string|undefined,url:string,id:string){
  const source=(title?.trim()||new URL(url).hostname||'captura')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,80)||'captura';
  return `evidencia-${source}-${id.slice(0,8)}.png`;
}

async function authorize(c:any){
  const token=(c.req.header('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)throw new Error('OIDC requerido');
  await verifyGitHubActionsToken(token,audience);
}

async function verificationRow(c:any,verificationId:string,jobId:string){
  const row=await c.env.DB.prepare(`SELECT v.id,v.job_id,v.user_id,v.status,v.evidence_id,w.progress
    FROM browser_verification_runs v JOIN work_jobs w ON w.id=v.job_id
    WHERE v.id=? AND v.job_id=?`).bind(verificationId,jobId).first();
  return row as VerificationRow|null;
}

export const evidence=new Hono<{Bindings:Bindings}>();

evidence.post('/browser/status',async c=>{
  try{
    await authorize(c);
    const parsed=statusSchema.safeParse(await c.req.json());
    if(!parsed.success)return c.json({error:'Estado de verificación inválido',details:parsed.error.flatten()},400);
    const x=parsed.data,row=await verificationRow(c,x.verificationId,x.jobId);
    if(!row)return c.json({error:'Verificación no encontrada'},404);
    if(x.userId&&x.userId!==row.user_id)return c.json({error:'El usuario no corresponde a la verificación'},403);
    if(!canTransitionBrowserVerification(row.status,x.status))return c.json({error:'La verificación ya terminó',status:row.status},409);
    if(row.status===x.status)return c.json({ok:true,id:row.id,status:row.status,idempotent:true});

    const completed=x.status==='failed';
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE browser_verification_runs SET status=?,run_id=COALESCE(?,run_id),error=?,
        started_at=CASE WHEN ?='running' THEN COALESCE(started_at,CURRENT_TIMESTAMP) ELSE started_at END,
        completed_at=CASE WHEN ?='failed' THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(x.status,x.runId||null,x.error?.slice(0,500)||null,x.status,x.status,row.id),
      ...(completed?[c.env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)')
        .bind(crypto.randomUUID(),row.job_id,`Verificación visual fallida: ${(x.error||'el workflow terminó antes de guardar evidencia').slice(0,300)}`,row.progress)]:[])
    ]);
    return c.json({ok:true,id:row.id,status:x.status});
  }catch(error){return c.json({error:error instanceof Error?error.message:'Error de estado de evidencia'},401);}
});

evidence.post('/browser',async c=>{
  try{
    await authorize(c);
    const parsed=evidenceSchema.safeParse(await c.req.json());
    if(!parsed.success)return c.json({error:'Evidencia inválida',details:parsed.error.flatten()},400);

    const x=parsed.data,id=crypto.randomUUID(),prefix=`evidence/${x.jobId||'system'}/${id}`;
    let ownerUserId=x.userId||null;
    if(x.jobId){
      const job=await c.env.DB.prepare('SELECT user_id FROM work_jobs WHERE id=?').bind(x.jobId).first<{user_id:string}>();
      if(!job)return c.json({error:'Trabajo no encontrado'},404);
      if(ownerUserId&&ownerUserId!==job.user_id)return c.json({error:'El usuario no corresponde al trabajo'},403);
      ownerUserId=job.user_id;
    }

    let verification:VerificationRow|null=null;
    if(x.verificationId){
      if(!x.jobId)return c.json({error:'La verificación requiere un trabajo'},400);
      verification=await verificationRow(c,x.verificationId,x.jobId);
      if(!verification)return c.json({error:'Verificación no encontrada'},404);
      if(ownerUserId!==verification.user_id)return c.json({error:'La verificación no corresponde al propietario'},403);
      if(verification.evidence_id){
        const existing=await c.env.DB.prepare(`SELECT e.id,e.report_key,e.screenshot_key,f.id file_id FROM browser_evidence e
          LEFT JOIN files f ON f.object_key=e.screenshot_key AND f.user_id=? WHERE e.id=?`).bind(ownerUserId,verification.evidence_id).first() as ExistingEvidence|null;
        if(existing)return c.json({ok:true,id:existing.id,reportKey:existing.report_key,screenshotKey:existing.screenshot_key,fileId:existing.file_id,duplicate:true});
      }
    }

    const outcome=resolveBrowserVerificationOutcome(x.status,x.verificationStatus);
    if(verification&&!canTransitionBrowserVerification(verification.status,outcome))return c.json({error:'La verificación ya terminó',status:verification.status},409);

    const reportKey=`${prefix}/report.json`,screenshotKey=x.screenshotBase64?`${prefix}/page.png`:null;
    const screenshotBytes=x.screenshotBase64?decodeBase64(x.screenshotBase64):null;
    const fileId=screenshotKey&&screenshotBytes&&ownerUserId?crypto.randomUUID():null;
    const report={id,verificationId:x.verificationId||null,verificationStatus:outcome,jobId:x.jobId||null,userId:ownerUserId,source:x.source,url:x.url,title:x.title||null,status:x.status??null,errors:x.errors,runId:x.runId||null,createdAt:new Date().toISOString()};

    await c.env.FILES.put(reportKey,JSON.stringify(report,null,2),{httpMetadata:{contentType:'application/json'}});
    if(screenshotKey&&screenshotBytes)await c.env.FILES.put(screenshotKey,screenshotBytes,{httpMetadata:{contentType:'image/png'}});

    const writes=[c.env.DB.prepare('INSERT INTO browser_evidence(id,user_id,job_id,source,url,title,http_status,errors_json,report_key,screenshot_key,run_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,ownerUserId,x.jobId||null,x.source,x.url,x.title||null,x.status??null,JSON.stringify(x.errors),reportKey,screenshotKey,x.runId||null)];
    if(fileId&&screenshotKey&&screenshotBytes&&ownerUserId){
      writes.push(c.env.DB.prepare('INSERT INTO files(id,user_id,name,object_key,content_type,size_bytes) VALUES(?,?,?,?,?,?)').bind(fileId,ownerUserId,evidenceFileName(x.title,x.url,id),screenshotKey,'image/png',screenshotBytes.byteLength));
    }
    if(x.jobId){
      const message=outcome==='failed'
        ?`Verificación visual fallida: HTTP ${x.status??'desconocido'}, ${x.errors.length} errores${fileId?'; captura disponible en Archivos':''}`
        :fileId
          ?`Evidencia de navegador guardada: HTTP ${x.status??'desconocido'}, ${x.errors.length} errores; captura disponible en Archivos`
          :`Evidencia de navegador guardada: HTTP ${x.status??'desconocido'}, ${x.errors.length} errores`;
      writes.push(c.env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)').bind(crypto.randomUUID(),x.jobId,message,95));
    }
    if(x.verificationId&&x.jobId&&ownerUserId){
      writes.push(c.env.DB.prepare(`UPDATE browser_verification_runs SET status=?,run_id=COALESCE(?,run_id),evidence_id=?,error=?,
        started_at=COALESCE(started_at,created_at),completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND job_id=? AND user_id=?`).bind(outcome,x.runId||null,id,browserVerificationError(x.errors),x.verificationId,x.jobId,ownerUserId));
    }
    await c.env.DB.batch(writes);
    return c.json({ok:true,id,verificationId:x.verificationId||null,verificationStatus:outcome,reportKey,screenshotKey,fileId});
  }catch(error){return c.json({error:error instanceof Error?error.message:'Error de evidencia'},401);}
});
