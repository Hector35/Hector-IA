import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/turno-rx/runtime-preflight-v89.js','utf8');
const KEY='pendientes-table-v2';

function run(rows){
  class Storage{
    constructor(){this.map=new Map([[KEY,JSON.stringify(rows)]]);}
    getItem(key){return this.map.has(key)?this.map.get(key):null;}
    setItem(key,value){this.map.set(key,String(value));}
  }
  const localStorage=new Storage();
  const document={documentElement:{dataset:{}}};
  vm.runInNewContext(source,{Storage,localStorage,document,console,JSON,String,Number,Array,Object,Map});
  return JSON.parse(localStorage.getItem(KEY));
}

describe('Pendientes v89 preflight de Piso',()=>{
  it('aplica los rangos vigentes antes del primer render',()=>{
    const saved=run([
      {id:'a',category:'Piso',destination:'180'},
      {id:'b',category:'Piso',destination:'205'},
      {id:'c',category:'Piso',destination:'231'}
    ]);
    expect(saved[0]).toMatchObject({destinationFloor:'Tercero',destinationBlock:'A'});
    expect(saved[1]).toMatchObject({destinationFloor:'Quinto',destinationBlock:'A'});
    expect(saved[2]).toMatchObject({destinationFloor:'Quinto',destinationBlock:'A'});
  });

  it('repara filas legado sin categoría que el runtime base reconoce como Piso',()=>{
    const [saved]=run([{id:'legacy',category:'',target:'198'}]);
    expect(saved).toMatchObject({destinationFloor:'Tercero',destinationBlock:'A'});
  });

  it('no reclasifica una fila explícita de imagenología',()=>{
    const [saved]=run([{id:'rx',category:'Rayos X',target:'205'}]);
    expect(saved.destinationFloor).toBeUndefined();
    expect(saved.destinationBlock).toBeUndefined();
  });

  it('respeta una corrección manual explícita de piso y bloque',()=>{
    const [saved]=run([{id:'manual',category:'Piso',destination:'205',destinationFloor:'Tercero',destinationBlock:'B',manualOverrides:{destinationFloor:true,destinationBlock:true}}]);
    expect(saved.destinationFloor).toBe('Tercero');
    expect(saved.destinationBlock).toBe('B');
  });

  it('documenta los límites 166–198 y 199–231 en el preflight',()=>{
    expect(source).toContain('if(n<=198)');
    expect(source).toContain("return{floor:'Tercero',block:'A'}");
    expect(source).toContain('if(n<=231)');
    expect(source).toContain("return{floor:'Quinto',block:'A'}");
  });
});
