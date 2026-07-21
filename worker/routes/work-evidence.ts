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

export function parseEvidenceErrors(value:string|null):string[]{
 if(!value)return [];
 try{
  const parsed=JSON.parse(value);
  return Array.isArray(parsed)?parsed.filter((x):x is string=>typeof x==='string').slice(0,100):[];
 }catch{return [];}
}

export const workEvidence=new Hono<{Bindings:Bindings;Variables:Variables}>();
workEvidence.use('*',requireAuth);

async function ownedJob(c:any,jobId:string){
 return c.env.DB.prepare('SELECT id,title,status FROM work_jobs WHERE id=? AND user_id=?').bind(jobId,c.get('userId')).first<{id:string;title:string;status:string}>();
}

workEvidence.get('/jobs/:jobId',async c=>{
 const job=await ownedJob(c,c.req.param('jobId'));
 if(!job)return c.json({error:'Trabajo no encontrado'},404);
 const rows=(await c.env.DB.prepare(`SELECT e.id,e.source,e.url,e.title,e.http_status,e.errors_json,e.run_id,e.created_at,e.screenshot_key,f.id file_id
  FROM browser_evidence e
  LEFT JOIN files f ON f.object_key=e.screenshot_key AND f.user_id=?
  WHERE e.job_id=? AND e.user_id=?
  ORDER BY e.created_at DESC LIMIT 50`).bind(c.get('userId'),job.id,c.get('userId')).all<any>()).results;
 const items:WorkEvidenceItem[]=rows.map((row:any)=>({id:row.id,source:row.source,url:row.url,title:row.title,http_status:row.http_status,errors:parseEvidenceErrors(row.errors_json),run_id:row.run_id,created_at:row.created_at,has_screenshot:!!row.screenshot_key,file_id:row.file_id||null}));
 return c.json({job,items});
});

workEvidence.get('/jobs/:jobId/:evidenceId/screenshot',async c=>{
 const row=await c.env.DB.prepare(`SELECT e.screenshot_key FROM browser_evidence e JOIN work_jobs w ON w.id=e.job_id
  WHERE e.id=? AND e.job_id=? AND e.user_id=? AND w.user_id=?`).bind(c.req.param('evidenceId'),c.req.param('jobId'),c.get('userId'),c.get('userId')).first<{screenshot_key:string|null}>();
 if(!row?.screenshot_key)return c.json({error:'Captura no encontrada'},404);
 const object=await c.env.FILES.get(row.screenshot_key);
 if(!object)return c.json({error:'Captura no encontrada'},404);
 return new Response(object.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=300','Content-Disposition':'inline'}});
});

workEvidence.get('/jobs/:jobId/:evidenceId/report',async c=>{
 const row=await c.env.DB.prepare(`SELECT e.report_key FROM browser_evidence e JOIN work_jobs w ON w.id=e.job_id
  WHERE e.id=? AND e.job_id=? AND e.user_id=? AND w.user_id=?`).bind(c.req.param('evidenceId'),c.req.param('jobId'),c.get('userId'),c.get('userId')).first<{report_key:string}>();
 if(!row?.report_key)return c.json({error:'Informe no encontrado'},404);
 const object=await c.env.FILES.get(row.report_key);
 if(!object)return c.json({error:'Informe no encontrado'},404);
 return new Response(object.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':'inline'}});
});
