import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/turno-rx/runtime-preflight-v89.js','utf8');
const index=readFileSync('public/turno-rx/index.html','utf8');
const sw=readFileSync('public/turno-rx/sw.js','utf8');
const KEY='pendientes-table-v2';
const SHIFT_KEY='pendientes-shift-v1';

function runtime(rows,{throwOnSet=false}={}){
  class Storage{
    constructor(){this.map=new Map([[KEY,JSON.stringify(rows)]]);this.writes=0;this.throwOnSet=throwOnSet;}
    getItem(key){return this.map.has(key)?this.map.get(key):null;}
    setItem(key,value){this.writes+=1;if(this.throwOnSet){const error=new Error('quota');error.name='QuotaExceededError';throw error;}this.map.set(key,String(value));}
  }
  const localStorage=new Storage();
  const listeners={};
  const document={
    readyState:'loading',
    documentElement:{dataset:{}},
    addEventListener(type,handler){listeners[type]=handler;}
  };
  const context={Storage,localStorage,document,console,JSON,String,Array,Object,Map,Set,Error};
  vm.runInNewContext(source,context);
  return {localStorage,document,context,fireDOMContentLoaded(){document.readyState='interactive';listeners.DOMContentLoaded?.();}};
}

describe('Pendientes v91 safe boot',()=>{
  it('no modifica pacientes antes del primer render',()=>{
    const original=[{id:'a',category:'Piso',destination:'205'}];
    const {localStorage,document}=runtime(original);
    expect(localStorage.writes).toBe(0);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(original);
    expect(document.documentElement.dataset.pendientesPreflightBuild).toBe('91');
  });

  it('mantiene correcciones manuales cuando la app escribe durante el arranque',()=>{
    const before=[{id:'a',category:'TAC',target:'TAC cráneo',manualOverrides:{category:true}}];
    const {localStorage}=runtime(before);
    localStorage.setItem(KEY,JSON.stringify([{id:'a',category:'Rayos X',target:'TAC cráneo'}]));
    const [saved]=JSON.parse(localStorage.getItem(KEY));
    expect(saved.category).toBe('TAC');
    expect(saved.manualOverrides.category).toBe(true);
  });

  it('absorbe QuotaExceededError solo durante bootstrap y conserva los datos existentes',()=>{
    const original=[{id:'a',category:'RX',target:'Tórax'}];
    const {localStorage,context,fireDOMContentLoaded}=runtime(original,{throwOnSet:true});
    expect(()=>localStorage.setItem(SHIFT_KEY,JSON.stringify({id:'shift'}))).not.toThrow();
    expect(()=>localStorage.setItem(KEY,JSON.stringify(original))).not.toThrow();
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(original);
    expect(context.__PENDIENTES_BOOT_STORAGE_ERROR__?.name).toBe('QuotaExceededError');
    fireDOMContentLoaded();
    expect(()=>localStorage.setItem(SHIFT_KEY,JSON.stringify({id:'later'}))).toThrow(/quota/);
  });

  it('no reintroduce la migración de Piso en el camino crítico de arranque',()=>{
    expect(source).not.toContain('function pisoDestination');
    expect(source).not.toContain('normalizar Piso antes del primer render');
    expect(source).toContain('no debe dejar la PWA en blanco');
  });

  it('fuerza shell v91 y una URL nueva del preflight en la PWA instalada',()=>{
    expect(index).toContain('/turno-rx/runtime-preflight-v89.js?v=91');
    expect(index).toContain('Production v91');
    expect(sw).toContain("const CACHE = 'pendientes-shell-20260822-91'");
    expect(sw).toContain('/turno-rx/runtime-preflight-v89.js?v=91');
  });
});
