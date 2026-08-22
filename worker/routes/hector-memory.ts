import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {CONTEXT_RECORD_TYPES,memoryKindForRecord,type ContextRecordType} from '../lib/context-hub';

export const hectorMemory=new Hono<{Bindings:Bindings;Variables:Variables}>();
hectorMemory.use('*',requireAuth);

const recordType=z.enum(CONTEXT_RECORD_TYPES);
const upsertSchema=z.object({
  recordType:recordType.default('state'),subject:z.string().trim().min(1).max(240),content:z.string().trim().min(2).max(12000),
  confidence:z.number().min(0).max(1).default(.95),sourceType:z.string().trim().min(1).max(80).default('hector-memory-reconcile'),sourceRef:z.string().trim().max(500).nullable().optional(),
  tags:z.array(z.string().trim().min(1).max(80)).max(40).default([]),metadata:z.record(z.string(),z.unknown()).default({}),importance:z.number().int().min(1).max(5).default(4),
  strategy:z.enum(['auto','supersede','append']).default('auto')
});
const MUTABLE=new Set<ContextRecordType>(['state','project','task','decision','preference']);

hectorMemory.post('/upsert',async c=>{
  const parsed=upsertSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Memoria inválida',details:parsed.error.flatten()},400);
  const v=parsed.data,uid=c.get('userId'),supersede=v.strategy==='supersede'||(v.strategy==='auto'&&MUTABLE.has(v.recordType));
  const previous=(await c.env.DB.prepare("SELECT id,content,confidence,updated_at FROM context_hub_records WHERE user_id=? AND record_type=? AND lower(COALESCE(subject,''))=lower(?) AND status='active' ORDER BY updated_at DESC").bind(uid,v.recordType,v.subject).all<any>()).results||[];
  const duplicate=previous.find((x:any)=>String(x.content).trim().toLowerCase()===v.content.toLowerCase());
  if(duplicate)return c.json({ok:true,deduplicated:true,item:{id:duplicate.id,type:v.recordType,subject:v.subject,content:v.content},superseded:[]});
  const id=crypto.randomUUID(),supersedesId=supersede&&previous.length?String((previous[0] as any).id):null,kind=memoryKindForRecord(v.recordType);
  const statements:any[]=[
    c.env.DB.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?,?,?,?,'hector-memory-reconcile')").bind(id,uid,kind,v.content,v.importance),
    c.env.DB.prepare(`INSERT INTO context_hub_records(id,user_id,memory_id,record_type,subject,content,confidence,source_type,source_ref,tags_json,metadata_json,status,supersedes_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'active',?)`).bind(id,uid,id,v.recordType,v.subject,v.content,v.confidence,v.sourceType,v.sourceRef??null,JSON.stringify(v.tags),JSON.stringify({...v.metadata,reconciliation:{strategy:v.strategy,supersededCount:supersede?previous.length:0}}),supersedesId),
    c.env.DB.prepare("INSERT INTO audit_log(id,user_id,action,resource_type,resource_id,metadata_json) VALUES(?,?,'context_reconcile','context_hub_record',?,?)").bind(crypto.randomUUID(),uid,id,JSON.stringify({recordType:v.recordType,subject:v.subject,strategy:v.strategy,superseded:previous.map((x:any)=>x.id)}))
  ];
  if(supersede&&previous.length)statements.push(c.env.DB.prepare("UPDATE context_hub_records SET status='superseded',valid_until=COALESCE(valid_until,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND record_type=? AND lower(COALESCE(subject,''))=lower(?) AND status='active' AND id<>?").bind(uid,v.recordType,v.subject,id));
  await c.env.DB.batch(statements);
  return c.json({ok:true,deduplicated:false,item:{id,type:v.recordType,subject:v.subject,content:v.content,confidence:v.confidence,supersedesId},superseded:supersede?previous.map((x:any)=>x.id):[]},201);
});

hectorMemory.get('/conflicts',async c=>{
  const rows=await c.env.DB.prepare(`SELECT record_type,subject,COUNT(*) active_count,GROUP_CONCAT(id) ids
    FROM context_hub_records WHERE user_id=? AND status='active' AND subject IS NOT NULL
    GROUP BY record_type,lower(subject) HAVING COUNT(*)>1 ORDER BY active_count DESC,subject LIMIT 100`).bind(c.get('userId')).all<any>();
  return c.json({items:(rows.results||[]).map((x:any)=>({...x,ids:String(x.ids||'').split(',').filter(Boolean)}))});
});
