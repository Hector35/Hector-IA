import {describe,expect,it} from 'vitest';
import {cosineSimilarity,EMBEDDING_DIMENSIONS,EMBEDDING_MODEL,embeddingNeedsRefresh,parseEmbedding,selectEmbeddingBackfill,type MemoryRow} from './context';

function vector(value=0.1){return JSON.stringify(Array.from({length:EMBEDDING_DIMENSIONS},()=>value));}
function row(overrides:Partial<MemoryRow>&Pick<MemoryRow,'id'|'content'>):MemoryRow{return{model:EMBEDDING_MODEL,dimensions:EMBEDDING_DIMENSIONS,vector_json:vector(),...overrides};}

describe('cosineSimilarity',()=>{
  it('identifica vectores equivalentes y opuestos',()=>{
    expect(cosineSimilarity([1,0],[1,0])).toBeCloseTo(1);
    expect(cosineSimilarity([1,0],[-1,0])).toBeCloseTo(-1);
  });
  it('rechaza dimensiones incompatibles',()=>{
    expect(cosineSimilarity([1,0],[1])).toBe(0);
  });
});

describe('parseEmbedding',()=>{
  it('acepta únicamente arreglos numéricos finitos',()=>{
    expect(parseEmbedding('[1,2,3]')).toEqual([1,2,3]);
    expect(parseEmbedding('{"x":1}')).toBeNull();
    expect(parseEmbedding('[1,"2"]')).toBeNull();
    expect(parseEmbedding('texto roto')).toBeNull();
  });
});

describe('embeddingNeedsRefresh',()=>{
  it('detecta vectores ausentes, corruptos o de otra versión',()=>{
    expect(embeddingNeedsRefresh(row({id:'ok',content:'ok'}))).toBe(false);
    expect(embeddingNeedsRefresh(row({id:'missing',content:'missing',vector_json:null}))).toBe(true);
    expect(embeddingNeedsRefresh(row({id:'corrupt',content:'corrupt',vector_json:'[1,"x"]'}))).toBe(true);
    expect(embeddingNeedsRefresh(row({id:'model',content:'model',model:'modelo-anterior'}))).toBe(true);
    expect(embeddingNeedsRefresh(row({id:'dimensions',content:'dimensions',dimensions:1536}))).toBe(true);
  });
});

describe('selectEmbeddingBackfill',()=>{
  it('prioriza memorias lexicalmente relevantes y omite vectores vigentes',()=>{
    const rows=[
      row({id:'fresh',content:'memoria vigente'}),
      row({id:'old-first',content:'dato general antiguo',vector_json:null}),
      row({id:'relevant',content:'Héctor prefiere explicaciones como ingeniero',vector_json:null}),
      row({id:'old-second',content:'otro dato general',model:'modelo-anterior'})
    ];
    expect(selectEmbeddingBackfill(rows,['Héctor prefiere explicaciones como ingeniero'],2).map(x=>x.id)).toEqual(['relevant','old-first']);
  });

  it('respeta el límite de costo configurado',()=>{
    const rows=Array.from({length:10},(_,index)=>row({id:String(index),content:`memoria ${index}`,vector_json:null}));
    expect(selectEmbeddingBackfill(rows,[],3)).toHaveLength(3);
  });
});
