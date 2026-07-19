import {describe,expect,it} from 'vitest';
import {chooseProvider} from './providers';

describe('chooseProvider',()=>{
  it('usa Cloudflare para consultas breves y no sensibles',()=>{
    expect(chooseProvider('hola, resume esto','fast',false,true).provider).toBe('cloudflare');
  });
  it('mantiene OpenAI para web, complejidad y datos sensibles',()=>{
    expect(chooseProvider('busca noticias de hoy','fast',true,true).provider).toBe('openai');
    expect(chooseProvider('diseña la arquitectura completa','deep',false,true).provider).toBe('openai');
    expect(chooseProvider('revisa mi saldo bancario','fast',false,true).provider).toBe('openai');
  });
  it('permite apagar Workers AI sin cambiar código',()=>{
    expect(chooseProvider('hola','fast',false,false)).toEqual({provider:'openai',reason:'Workers AI desactivado'});
  });
});
