import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {EMBEDDING_DIMENSIONS,EMBEDDING_MODEL,embeddingNeedsRefresh,loadContextPack,type MemoryRow} from '../lib/context';

export const memoryStatus=new Hono<{Bindings:Bindings;Variables:Variables}>();
memoryStatus.use('*',requireAuth);

type StatusRow=MemoryRow&{kind:string;source:string;importance:number;updated_at:string};
export type MemoryControlItem={id:string;kind:string;content:string;source:string;importance:number;updated_at:string;embeddingReady:boolean};

const memoryContentSchema=z.string().trim().min(2).max(2000);
const memoryKindSchema=z.string().trim().regex(/^[a-z][a-z0-9_-]{0,29}$/i);
const memoryImportanceSchema=z.number().int().min(1).max(5);
export const memoryItemSchema=z.object({content:memoryContentSchema,kind:memoryKindSchema.default('fact'),importance:memoryImportanceSchema.default(3)});
export const memoryUpdateSchema=z.object({content:memoryContentSchema.optional(),kind:memoryKindSchema.optional(),importance:memoryImportanceSchema.optional()}).refine(value=>Object.keys(value).length>0,'Sin cambios');

export function toMemoryControlItem(row:StatusRow):MemoryControlItem{
  return{id:row.id,kind:row.kind,content:row.content,source:row.source,importance:Number(row.importance)||1,updated_at:row.updated_at,embeddingReady:!embeddingNeedsRefresh(row)};
}

export function selectMemoryPreview(relevant:string[],rows:MemoryControlItem[]){
  const remaining=[...rows],selected:(Array<MemoryControlItem&{rank:number}>)=[];
  for(const content of relevant){
    const index=remaining.findIndex(row=>row.content===content);
    if(index<0)continue;
    const [row]=remaining.splice(index,1);
    selected.push({...row,rank:selected.length+1});
  }
  return selected;
}

export function summarizeMemoryCoverage(rows:StatusRow[]){
  const total=rows.length;
  const needsRefresh=rows.filter(embeddingNeedsRefresh);
  const ready=total-needsRefresh.length;
  const byKind:Record<string,number>={};
  const bySource:Record<string,number>={};
  for(const row of rows){
    byKind[row.kind]=(byKind[row.kind]||0)+1;
    bySource[row.source]=(bySource[row.source]||0)+1;
  }
  return{
    total,
    ready,
    needsRefresh:needsRefresh.length,
    coveragePercent:total?Math.round((ready/total)*1000)/10:100,
    complete:needsRefresh.length===0,
    model:EMBEDDING_MODEL,
    dimensions:EMBEDDING_DIMENSIONS,
    byKind,
    bySource,
    oldestPendingUpdatedAt:needsRefresh.map(x=>x.updated_at).filter(Boolean).sort()[0]||null
  };
}

async function loadRows(c:any):Promise<StatusRow[]>{
  const result=await c.env.DB.prepare(`SELECT m.id,m.kind,m.content,m.source,m.importance,m.updated_at,
    e.model,e.dimensions,e.vector_json
    FROM memories m LEFT JOIN memory_embeddings e ON e.memory_id=m.id
    WHERE m.user_id=?
    ORDER BY m.importance DESC,m.updated_at DESC`).bind(c.get('userId')).all();
  return(result.results||[]) as StatusRow[];
}

memoryStatus.get('/status',async c=>{
  const rows=await loadRows(c);
  return c.json({memory:summarizeMemoryCoverage(rows),backfill:{mode:'progressive-on-chat',maxPerInteraction:6}});
});

memoryStatus.get('/items',async c=>c.json({items:(await loadRows(c)).map(toMemoryControlItem)}));

memoryStatus.post('/items',async c=>{
  const parsed=memoryItemSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'Memoria inválida',details:parsed.error.flatten()},400);
  const id=crypto.randomUUID(),item=parsed.data;
  await c.env.DB.prepare("INSERT INTO memories(id,user_id,kind,content,importance,source) VALUES(?,?,?,?,?,'memory-control')")
    .bind(id,c.get('userId'),item.kind,item.content,item.importance).run();
  return c.json({item:{id,...item,source:'memory-control',updated_at:new Date().toISOString(),embeddingReady:false}},201);
});

memoryStatus.patch('/items/:id',async c=>{
  const parsed=memoryUpdateSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'Cambios inválidos',details:parsed.error.flatten()},400);
  const current=await c.env.DB.prepare('SELECT id,content FROM memories WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).first();
  if(!current)return c.json({error:'Memoria no encontrada'},404);
  const next=parsed.data,content=next.content??String((current as any).content);
  await c.env.DB.prepare(`UPDATE memories SET content=?,kind=COALESCE(?,kind),importance=COALESCE(?,importance),updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id=?`).bind(content,next.kind??null,next.importance??null,c.req.param('id'),c.get('userId')).run();
  if(next.content!==undefined&&next.content!==String((current as any).content))await c.env.DB.prepare('DELETE FROM memory_embeddings WHERE memory_id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).run();
  const row=(await loadRows(c)).find(item=>item.id===c.req.param('id'));
  return c.json({item:row?toMemoryControlItem(row):null});
});

memoryStatus.delete('/items/:id',async c=>{
  const current=await c.env.DB.prepare('SELECT id FROM memories WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')).first();
  if(!current)return c.json({error:'Memoria no encontrada'},404);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM memory_embeddings WHERE memory_id=? AND user_id=?').bind(c.req.param('id'),c.get('userId')),
    c.env.DB.prepare('DELETE FROM memories WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('userId'))
  ]);
  return c.json({ok:true});
});

memoryStatus.post('/preview',async c=>{
  const parsed=z.object({query:z.string().trim().min(2).max(2000)}).safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:'Consulta inválida'},400);
  const [pack,rows]=await Promise.all([loadContextPack(c.env,c.get('userId'),undefined,parsed.data.query),loadRows(c)]);
  return c.json({query:parsed.data.query,items:selectMemoryPreview(pack.memories,rows.map(toMemoryControlItem)),selectedCount:pack.memories.length});
});
