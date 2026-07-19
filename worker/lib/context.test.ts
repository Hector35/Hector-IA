import { describe,expect,it } from 'vitest';
import { loadContextPack } from './context';

type Row={role:'user'|'assistant';content:string};
function mockDb(recentResults:Row[]){
  return{
    prepare(sql:string){
      return{
        bind(){return this;},
        all:async()=>sql.includes('FROM messages')?{results:recentResults}:{results:[]},
        first:async()=>null
      };
    }
  } as any;
}

describe('Héctor OS context loading',()=>{
  it('excludes the just-saved current user message from recent history',async()=>{
    const pack=await loadContextPack(mockDb([
      {role:'user',content:'Necesito ayuda con D1'},
      {role:'assistant',content:'Respuesta anterior'}
    ]),'user','conversation','Necesito ayuda con D1');
    expect(pack.recentMessages).toEqual([{role:'assistant',content:'Respuesta anterior'}]);
  });

  it('keeps historical repeated text when the latest stored turn is from the assistant',async()=>{
    const pack=await loadContextPack(mockDb([
      {role:'assistant',content:'Respuesta anterior'},
      {role:'user',content:'Necesito ayuda con D1'}
    ]),'user','conversation','Necesito ayuda con D1');
    expect(pack.recentMessages).toEqual([
      {role:'user',content:'Necesito ayuda con D1'},
      {role:'assistant',content:'Respuesta anterior'}
    ]);
  });

  it('matches equivalent whitespace when removing the current turn',async()=>{
    const pack=await loadContextPack(mockDb([
      {role:'user',content:'Necesito   ayuda con D1'},
      {role:'assistant',content:'Respuesta anterior'}
    ]),'user','conversation','Necesito ayuda con D1');
    expect(pack.recentMessages).toEqual([{role:'assistant',content:'Respuesta anterior'}]);
  });
});
