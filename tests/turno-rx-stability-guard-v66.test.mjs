import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,expect,it} from 'vitest';

const source=readFileSync('public/turno-rx/stability-guard-v66.js','utf8');

function runtime(seed={}){
  class Storage{
    constructor(){this.map=new Map(Object.entries(seed));}
    getItem(key){return this.map.has(key)?this.map.get(key):null;}
    setItem(key,value){this.map.set(key,String(value));}
  }
  const localStorage=new Storage();
  vm.runInNewContext(source,{Storage,localStorage,JSON,String,Set,Map,Array,Object,Boolean});
  return localStorage;
}

describe('Pendientes stability guard v66',()=>{
  it('preserva turnos antiguos cuando el controlador intenta guardar una lista truncada',()=>{
    const key='pendientes-shift-history-v1';
    const old=Array.from({length:65},(_,i)=>({shift:{id:`shift-${i}`,startedAt:`2026-08-${String((i%18)+1).padStart(2,'0')}T07:00:00.000Z`},rows:[{id:`r-${i}`}]}));
    const store=runtime({[key]:JSON.stringify(old)});
    store.setItem(key,JSON.stringify(old.slice(0,60)));
    const saved=JSON.parse(store.getItem(key));
    expect(saved).toHaveLength(65);
    expect(saved.some(entry=>entry.shift.id==='shift-64')).toBe(true);
  });

  it('limpia un campo de revisión cuando fue corregido manualmente',()=>{
    const key='pendientes-table-v2';
    const before=[{id:'1',bed:'',needsReview:true,reviewFields:['bed'],manualOverrides:{}}];
    const store=runtime({[key]:JSON.stringify(before)});
    store.setItem(key,JSON.stringify([{...before[0],bed:'22',manualOverrides:{bed:true}}]));
    const [saved]=JSON.parse(store.getItem(key));
    expect(saved.needsReview).toBe(false);
    expect(saved.reviewFields).toEqual([]);
  });

  it('no borra una revisión si el campo sigue sin resolver',()=>{
    const key='pendientes-table-v2';
    const before=[{id:'1',bed:'',needsReview:true,reviewFields:['bed'],manualOverrides:{}}];
    const store=runtime({[key]:JSON.stringify(before)});
    store.setItem(key,JSON.stringify(before));
    const [saved]=JSON.parse(store.getItem(key));
    expect(saved.needsReview).toBe(true);
    expect(saved.reviewFields).toEqual(['bed']);
  });

  it('se carga antes del controlador consolidado y forma parte del shell offline',()=>{
    const index=readFileSync('public/turno-rx/index.html','utf8');
    const sw=readFileSync('public/turno-rx/sw.js','utf8');
    expect(index.indexOf('stability-guard-v66.js?v=66')).toBeGreaterThan(-1);
    expect(index.indexOf('stability-guard-v66.js?v=66')).toBeLessThan(index.indexOf('stability.js?v=20260818.1'));
    expect(sw).toContain("const CACHE = 'pendientes-shell-20260818-7'");
    expect(sw).toContain('/turno-rx/stability-guard-v66.js?v=66');
    expect(sw).toContain('/turno-rx/review-confidence-v67.js?v=70');
    expect(sw).toContain('/turno-rx/photo-fingerprint-history-v70.js?v=70');
    expect(sw).toContain('/turno-rx/photo-dedupe-v68.js?v=70');
    expect(sw).toContain('/turno-rx/manual-category-v72.js?v=72');
  });
});