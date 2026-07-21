import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';

export type WorkEvidenceItem={
 id:string;
 source:string;
 url:string;
 title:string|null;
 http_status:number|null;
 errors:string[];
 run_id:string|null;
 created_at:string;
 has_screenshot:boolean;
 file_id:string|null;
};

export type WorkVerificationItem={
 id:string;
 url:string;
 viewport:string;
 status:'queued'|'running'|'completed'|'failed';
 run_id:string|null;
 evidence_id:string|null;
 error:string|null;
 created_at:string;
 started_at:string|null;
 completed_at:string|null;
 updated_at:string;
};

export type VerificationTarget={url:string;viewport:string};

type WorkEvidenceRow={
 id:string;
 source:string;
 url:string;
 title:string|null;
 http_status:number|null;
 errors_json:string|null;
 run_id:string|null;
 created_at:string;
 screenshot_key:string|null;
 file_id:string|null;
};

type WorkVerificationRow=WorkVerificationItem;
type OwnedJob={id:string;title:string;status:string;progress:number};

export function parseEvidenceErrors(value:string|null):string[]{
 if(!value)return [];
 try{
  const parsed=JSON.parse(value);
  return Array.isArray(parsed)?parsed.filter((x):x is string=>typeof x==='string').slice(0,100):[];
 }catch{return [];}
}

function isPrivateHostname(value:string){
 const hostname=value.toLowerCase().replace(/^\[|\]$/g,'');
 if(hostname==='localhost'||hostname.endsWith('.localhost')||hostname.endsWith('.local')||hostname.endsWith('.internal'))return true;
 if(hostname==='::'||hostname==='::1'||/^(fc|fd|fe8|fe9|fea|feb)/.test(hostname))return true;
 const mapped=hostname.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
 const ipv4=mapped||hostname;
 const parts=ipv4.split('.');
 if(parts.length!==4||!parts.every(part=>/^\d+$/.test(part)&&Number(part)>=0&&Number(part)<=255))return false;
 const [a,b]=parts.map(Number);
 return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===198&&(b===18||b===19));
}

export function normalizeVerificationTarget(value:unknown):VerificationTarget|null{
 if(!value||typeof value!=='object')return null;
 const input=value as Record<string,unknown>;
 if(typeof input.url!=='string')return null;
 let url:URL;
 try{url=new URL(input.url.trim());}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||isPrivateHostname(url.hostname))return null;
 const viewport=typeof input.viewport==='string'&&input.viewport.trim()?input.viewport.trim():'390x844';
 const match=/^(\d{2,4})x(\d{2,4})$/.exec(viewport);
 if(!match)return null;
 const width=Number(match[1]),height=Number(match[2]);
 if(width<320||width>1920||height<480||height>3000)return null;
 url.hash='';
 return{url:url.toString(),viewport:`${width}x${height}`};
}

export const workEvidence=new Hono<{Bindings:Bindings;Variables:Variables}>();
workEvidence.use('*',requireAuth);

async function ownedJob(c:any,jobId:string){
 const row=await c.env.DB.prepare('SELECT id,title,status,progress FROM work_jobs WHERE id=? AND user_id=?').bind(jobId,c.get('userId')).first();
 return row as OwnedJob|null;
}

async function addEvent(c:any,job:OwnedJob,message:string){
 await c.env.DB.prepare('INSERT INTO work_events(id,job_id,message,progress) VALUES(?,?,?,?)').bind(crypto.randomUUID(),job.id,message,job.progress).run();
}

async function addEventBestEffort(c:any,job:OwnedJob,message:string){
 try{await addEvent(c,job,message);}catch{}
}

async function failVerification(c:any,job:OwnedJob,verificationId:string,message:string){
 await c.env.DB.prepare("UPDATE browser_verification_runs SET status='failed',error=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND job_id=? AND user_id=?")
  .bind(message.slice(0,500),verificationId,job.id,c.get('userId')).run();
 await addEventBestEffort(c,job,message);
}

workEvidence.post('/jobs/:jobId/verify',async c=>{
 const job=await ownedJob(c,c.req.param('jobId'));
 if(!job)return c.json({error:'Trabajo no encontrado'},404);
 const target=normalizeVerificationTarget(await c.req.json().catch(()=>null));
 if(!target)return c.json({error:'Usa una URL HTTPS pública y un viewport válido, por ejemplo 390x844'},400);
 const recent=await c.env.DB.prepare("SELECT 1 recent FROM browser_verification_runs WHERE job_id=? AND created_at>=datetime('now','-2 minutes') LIMIT 1").bind(job.id).first();
 if(recent){c.header('Retry-After','120');return c.json({error:'Ya existe una verificación reciente para este trabajo'},429);}

 const verificationId=crypto.randomUUID();
 await c.env.DB.prepare("INSERT INTO browser_verification_runs(id,job_id,user_id,url,viewport,status) VALUES(?,?,?,?,?,'queued')")
  .bind(verificationId,job.id,c.get('userId'),target.url,target.viewport).run();

 const runnerToken=c.env.GITHUB_RUNNER_TOKEN?.trim();
 if(!runnerToken){
  await failVerification(c,job,verificationId,'Verificación visual no disponible: falta la credencial del runner');
  return c.json({error:'Runner de navegador no disponible'},503);
 }

 let response:Response;
 try{
  response=await fetch('https://api.github.com/repos/Hector35/Hector-IA/actions/workflows/agent-browser.yml/dispatches',{
   method:'POST',
   headers:{Authorization:`Bearer ${runnerToken}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'Hector-OS'},
   body:JSON.stringify({ref:'main',inputs:{url:target.url,viewport:target.viewport,job_id:job.id,user_id:c.get('userId'),verification_id:verificationId}})
  });
 }catch{
  await failVerification(c,job,verificationId,'No se pudo contactar al runner de verificación visual');
  return c.json({error:'No se pudo contactar al runner de navegador'},502);
 }
 if(response.status!==204){
  await failVerification(c,job,verificationId,`GitHub rechazó la verificación visual (HTTP ${response.status})`);
  return c.json({error:'GitHub rechazó la verificación visual',runnerStatus:response.status},502);
 }
 const parsed=new URL(target.url),label=`${parsed.origin}${parsed.pathname}`.slice(0,180);
 await addEventBestEffort(c,job,`Verificación visual solicitada: ${label}`);
 return c.json({accepted:true,jobId:job.id,url:target.url,viewport:target.viewport,verification:{id:verificationId,status:'queued'}},202);
});

workEvidence.get('/jobs/:jobId',async c=>{
 const job=await ownedJob(c,c.req.param('jobId'));
 if(!job)return c.json({error:'Trabajo no encontrado'},404);
 const [evidenceResult,verificationResult]=await Promise.all([
  c.env.DB.prepare(`SELECT e.id,e.source,e.url,e.title,e.http_status,e.errors_json,e.run_id,e.created_at,e.screenshot_key,f.id file_id
   FROM browser_evidence e
   LEFT JOIN files f ON f.object_key=e.screenshot_key AND f.user_id=?
   WHERE e.job_id=? AND e.user_id=?
   ORDER BY e.created_at DESC LIMIT 50`).bind(c.get('userId'),job.id,c.get('userId')).all(),
  c.env.DB.prepare(`SELECT id,url,viewport,status,run_id,evidence_id,error,created_at,started_at,completed_at,updated_at
   FROM browser_verification_runs WHERE job_id=? AND user_id=? ORDER BY created_at DESC LIMIT 20`).bind(job.id,c.get('userId')).all()
 ]);
 const rows=(evidenceResult.results??[]) as WorkEvidenceRow[];
 const items:WorkEvidenceItem[]=rows.map(row=>({id:row.id,source:row.source,url:row.url,title:row.title,http_status:row.http_status,errors:parseEvidenceErrors(row.errors_json),run_id:row.run_id,created_at:row.created_at,has_screenshot:!!row.screenshot_key,file_id:row.file_id||null}));
 const verifications=(verificationResult.results??[]) as WorkVerificationRow[];
 return c.json({job,items,verifications});
});

workEvidence.get('/jobs/:jobId/:evidenceId/screenshot',async c=>{
 const result=await c.env.DB.prepare(`SELECT e.screenshot_key FROM browser_evidence e JOIN work_jobs w ON w.id=e.job_id
  WHERE e.id=? AND e.job_id=? AND e.user_id=? AND w.user_id=?`).bind(c.req.param('evidenceId'),c.req.param('jobId'),c.get('userId'),c.get('userId')).first();
 const row=result as {screenshot_key:string|null}|null;
 if(!row?.screenshot_key)return c.json({error:'Captura no encontrada'},404);
 const object=await c.env.FILES.get(row.screenshot_key);
 if(!object)return c.json({error:'Captura no encontrada'},404);
 return new Response(object.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=300','Content-Disposition':'inline'}});
});

workEvidence.get('/jobs/:jobId/:evidenceId/report',async c=>{
 const result=await c.env.DB.prepare(`SELECT e.report_key FROM browser_evidence e JOIN work_jobs w ON w.id=e.job_id
  WHERE e.id=? AND e.job_id=? AND e.user_id=? AND w.user_id=?`).bind(c.req.param('evidenceId'),c.req.param('jobId'),c.get('userId'),c.get('userId')).first();
 const row=result as {report_key:string}|null;
 if(!row?.report_key)return c.json({error:'Informe no encontrado'},404);
 const object=await c.env.FILES.get(row.report_key);
 if(!object)return c.json({error:'Informe no encontrado'},404);
 return new Response(object.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':'inline'}});
});
