import {Hono} from 'hono';
import type {Bindings,Variables} from '../types';
import {requireAuth} from '../lib/auth';
import {EMBEDDING_DIMENSIONS,EMBEDDING_MODEL,embeddingNeedsRefresh,type MemoryRow} from '../lib/context';

export const memoryStatus=new Hono<{Bindings:Bindings;Variables:Variables}>();
memoryStatus.use('*',requireAuth);

type StatusRow=MemoryRow&{kind:string;source:string;importance:number;updated_at:string};

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

memoryStatus.get('/status',async c=>{
  const rows=(await c.env.DB.prepare(`SELECT m.id,m.kind,m.content,m.source,m.importance,m.updated_at,
    e.model,e.dimensions,e.vector_json
    FROM memories m LEFT JOIN memory_embeddings e ON e.memory_id=m.id
    WHERE m.user_id=?
    ORDER BY m.importance DESC,m.updated_at DESC`).bind(c.get('userId')).all<StatusRow>()).results||[];
  return c.json({memory:summarizeMemoryCoverage(rows),backfill:{mode:'progressive-on-chat',maxPerInteraction:6}});
});
