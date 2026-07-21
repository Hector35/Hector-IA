import {describe,expect,it} from 'vitest';
import {EMBEDDING_DIMENSIONS,EMBEDDING_MODEL,type MemoryRow} from '../lib/context';
import {summarizeMemoryCoverage} from './memory-status';

type StatusRow=MemoryRow&{kind:string;source:string;importance:number;updated_at:string};
const validVector=JSON.stringify(Array.from({length:EMBEDDING_DIMENSIONS},()=>0.1));
function row(overrides:Partial<StatusRow>&Pick<StatusRow,'id'>):StatusRow{return{content:'memoria',kind:'preference',source:'conversation-explicit',importance:4,updated_at:'2026-07-21 10:00:00',model:EMBEDDING_MODEL,dimensions:EMBEDDING_DIMENSIONS,vector_json:validVector,...overrides};}

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
