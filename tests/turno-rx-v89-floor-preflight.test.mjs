import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/turno-rx/runtime-preflight-v89.js','utf8');
const index=readFileSync('public/turno-rx/index.html','utf8');
const sw=readFileSync('public/turno-rx/sw.js','utf8');
const KEY='pendientes-table-v2';

function runtime(rows){
  class Storage{
    constructor(){this.map=new Map([[KEY,JSON.stringify(rows)]]);this.writes=0;}
    getItem(key){return this.map.has(key)?this.map.get(key):null;}
    setItem(key,value){this.writes+=1;this.map.set(key,String(value));}
  }
  const localStorage=new Storage();
  const document={documentElement:{dataset:{}}};
  vm.runInNewContext(source,{Storage,localStorage,document,console,JSON,String,Array,Object,Map});
  return {localStorage,document};
}

describe('Pendientes v90 safe boot',()=>{
  it('no modifica pacientes antes del primer render',()=>{
    const original=[{id:'a',category:'Piso',destination:'205'}];
    const {localStorage,document}=runtime(original);
    expect(localStorage.writes).toBe(0);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(original);
    expect(document.documentElement.dataset.pendientesPreflightBuild).toBe('90');
  });

  it('mantiene correcciones manuales cuando la app escribe después del arranque',()=>{
    const before=[{id:'a',category:'TAC',target:'TAC cráneo',manualOverrides:{category:true}}];
    const {localStorage}=runtime(before);
    localStorage.setItem(KEY,JSON.stringify([{id:'a',category:'Rayos X',target:'TAC cráneo'}]));
    const [saved]=JSON.parse(localStorage.getItem(KEY));
    expect(saved.category).toBe('TAC');
    expect(saved.manualOverrides.category).toBe(true);
  });

  it('no reintroduce la migración de Piso en el camino crítico de arranque',()=>{
    expect(source).not.toContain('function pisoDestination');
    expect(source).not.toContain('normalizar Piso antes del primer render');
    expect(source).toContain('no read-modify-write migration is allowed here');
  });

  it('fuerza shell v90 y una URL nueva del preflight en la PWA instalada',()=>{
    expect(index).toContain('/turno-rx/runtime-preflight-v89.js?v=90');
    expect(index).toContain('Production v90');
    expect(sw).toContain("const CACHE = 'pendientes-shell-20260822-90'");
    expect(sw).toContain('/turno-rx/runtime-preflight-v89.js?v=90');
  });
});
