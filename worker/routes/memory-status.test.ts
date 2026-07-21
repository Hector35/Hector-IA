import {describe,expect,it} from 'vitest';
import {EMBEDDING_DIMENSIONS,EMBEDDING_MODEL,type MemoryRow} from '../lib/context';
import {memoryItemSchema,memoryUpdateSchema,selectMemoryPreview,summarizeMemoryCoverage,toMemoryControlItem,type MemoryControlItem} from './memory-status';

type StatusRow=MemoryRow&{kind:string;source:string;importance:number;updated_at:string};
const validVector=JSON.stringify(Array.from({length:EMBEDDING_DIMENSIONS},()=>0.1));
function row(overrides:Partial<StatusRow>&Pick<StatusRow,'id'>):StatusRow{return{content:'memoria',kind:'preference',source:'conversation-explicit',importance:4,updated_at:'2026-07-21 10:00:00',model:EMBEDDING_MODEL,dimensions:EMBEDDING_DIMENSIONS,vector_json:validVector,...overrides};}

function item(overrides:Partial<MemoryControlItem>&Pick<MemoryControlItem,'id'|'content'>):MemoryControlItem{return{kind:'fact',source:'manual',importance:3,updated_at:'2026-07-21 10:00:00',embeddingReady:true,...overrides};}

describe('summarizeMemoryCoverage',()=>{
  it('calcula cobertura y pendientes sin exponer contenido',()=>{
    const result=summarizeMemoryCoverage([
      row({id:'ready'}),
      row({id:'missing',kind:'fact',source:'import',vector_json:null,updated_at:'2026-07-20 09:00:00'}),
      row({id:'stale',source:'import',model:'modelo-anterior',updated_at:'2026-07-21 08:00:00'})
    ]);
    expect(result).toMatchObject({total:3,ready:1,needsRefresh:2,coveragePercent:33.3,complete:false,oldestPendingUpdatedAt:'2026-07-20 09:00:00'});
    expect(result.byKind).toEqual({preference:2,fact:1});
    expect(result.bySource).toEqual({'conversation-explicit':1,import:2});
    expect(JSON.stringify(result)).not.toContain('memoria');
  });

  it('considera completa una memoria vacía',()=>{
    expect(summarizeMemoryCoverage([])).toMatchObject({total:0,ready:0,needsRefresh:0,coveragePercent:100,complete:true});
  });
});

describe('control verificable de memoria',()=>{
  it('expone si una memoria tiene embedding vigente',()=>{
    expect(toMemoryControlItem(row({id:'ready'}))).toMatchObject({id:'ready',embeddingReady:true});
    expect(toMemoryControlItem(row({id:'pending',vector_json:null}))).toMatchObject({id:'pending',embeddingReady:false});
  });

  it('mantiene el orden real de selección y evita duplicados',()=>{
    const rows=[item({id:'a',content:'Prefiere explicaciones técnicas'}),item({id:'b',content:'Trabaja en IMSS'}),item({id:'c',content:'Otra memoria'})];
    expect(selectMemoryPreview(['Trabaja en IMSS','Prefiere explicaciones técnicas','Trabaja en IMSS'],rows)).toEqual([
      {...rows[1],rank:1},
      {...rows[0],rank:2}
    ]);
  });

  it('valida creación y ediciones parciales sin aceptar cambios vacíos',()=>{
    expect(memoryItemSchema.parse({content:'Prefiere respuestas técnicas'})).toMatchObject({kind:'fact',importance:3});
    expect(memoryUpdateSchema.safeParse({importance:5}).success).toBe(true);
    expect(memoryUpdateSchema.safeParse({}).success).toBe(false);
    expect(memoryUpdateSchema.safeParse({importance:8}).success).toBe(false);
  });
});
