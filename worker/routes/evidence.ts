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

export function evidenceFileName(title:string|undefined,url:string,id:string){
  const source=(title?.trim()||new URL(url).hostname||'captura')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,80)||'captura';
  return `evidencia-${source}-${id.slice(0,8)}.png`;
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
    let ownerUserId=x.userId||null;
    if(x.jobId){
      const job=await c.env.DB.prepare('SELECT user_id FROM work_jobs WHERE id=?').bind(x.jobId).first<{user_id:string}>();
      if(!job)return c.json({error:'Trabajo no encontrado'},404);
      if(ownerUserId&&ownerUserId!==job.user_id)return c.json({error:'El usuario no corresponde al trabajo'},403);
      ownerUserId=job.user_id;
    }

    const reportKey=`${prefix}/report.json`,screenshotKey=x.screenshotBase64?`${prefix}/page.png`:null;
    const screenshotBytes=x.screenshotBase64?decodeBase64(x.screenshotBase64):null;
    const fileId=screenshotKey&&screenshotBytes&&ownerUserId?crypto.randomUUID():null;
    const report={id,jobId:x.jobId||null,userId:ownerUserId,source:x.source,url:x.url,title:x.title||null,status:x.status??null,errors:x.errors,runId:x.runId||null,createdAt:new Date().toISOString()};

    await c.env.FILES.put(reportKey,JSON.stringify(report,null,2),{httpMetadata:{contentType:'application/json'}});
    if(screenshotKey&&screenshotBytes)await c.env.FILES.put(screenshotKey,screenshotBytes,{httpMetadata:{contentType:'image/png'}});

    const writes=[c.env.DB.prepare('INSERT INTO browser_evidence(id,user_id,job_id,source,url,title,http_status,errors_json,report_key,screenshot_key,run_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,ownerUserId,x.jobId||null,x.source,x.url,x.title||null,x.status??null,JSON.stringify(x.errors),reportKey,screenshotKey,x.runId||null)];
    if(fileId&&screenshotKey&&screenshotBytes&&ownerUserId){
      writes.push(c.env.DB.prepare('INSERT INTO files(id,user_id,name,object_key,content_type,size_bytes) VALUES(?,?,?,?,?,?)').bind(fileId,ownerUserId,evidenceFileName(x.title,x.url,id),screenshotKey,'image/png',screenshotBytes.byteLength));
    }
    if(x.jobId){
      const message=fileId
        ?`Evidencia de navegador guardada: HTTP ${x.status??'desconocido'}, ${x.errors.length} errores; captura disponible en Archivos`
        :`Evidencia de navegador guardada: HTTP ${x.status??'desconocido'}, ${x.errors.length} errores`;
      writes.push(c.env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)').bind(crypto.randomUUID(),x.jobId,message,95));
    }
    await c.env.DB.batch(writes);
    return c.json({ok:true,id,reportKey,screenshotKey,fileId});
  }catch(error){return c.json({error:error instanceof Error?error.message:'Error de evidencia'},401);}
});
