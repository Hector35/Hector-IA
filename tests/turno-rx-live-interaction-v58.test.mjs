import {afterEach,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

const originalDocument=globalThis.document;
const originalWindow=globalThis.window;
const originalLocalStorage=globalThis.localStorage;
const originalCustomEvent=globalThis.CustomEvent;
const originalNavigator=globalThis.navigator;

afterEach(()=>{
  if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
  if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
  if(originalLocalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalLocalStorage;
  if(originalCustomEvent===undefined)delete globalThis.CustomEvent;else globalThis.CustomEvent=originalCustomEvent;
  if(originalNavigator===undefined)delete globalThis.navigator;else globalThis.navigator=originalNavigator;
});

class MemoryStorage{
  #values=new Map();
  getItem(key){return this.#values.has(key)?this.#values.get(key):null;}
  setItem(key,value){this.#values.set(key,String(value));}
  removeItem(key){this.#values.delete(key);}
}

class TestCustomEvent extends Event{
  constructor(type,options={}){super(type);this.detail=options.detail;}
}

test('sin recargar, sincroniza traslado, estado, contadores y diez cambios consecutivos de pestaña',async()=>{
  const root={innerHTML:''};
  class TestDocument extends EventTarget{
    getElementById(id){return id==='app'?root:null;}
    querySelectorAll(){return [];}
    querySelector(){return null;}
  }
  globalThis.document=new TestDocument();
  globalThis.window=new EventTarget();
  globalThis.localStorage=new MemoryStorage();
  globalThis.CustomEvent=TestCustomEvent;
  globalThis.navigator={serviceWorker:{register:()=>Promise.resolve({update:()=>Promise.resolve()})}};

  const row={id:'row-1',bed:'CE1',name:'Paciente',category:'Piso',target:'20',destination:'20',transport:'Por definir',status:'Pendiente',createdAt:'2026-08-18T00:00:00.000Z'};
  localStorage.setItem('pendientes-table-v2',JSON.stringify([row]));
  localStorage.setItem('pendientes-active-category-v49',JSON.stringify('Piso'));

  const app=await import('../public/turno-rx/app-v16.js?v58-interaction-test');
  expect(root.innerHTML).toMatch(/data-patient-id="row-1"[\s\S]*?<b>Por definir<\/b>/);

  for(const transport of ['Silla','Camilla','Por definir','Silla']){
    localStorage.setItem('pendientes-table-v2',JSON.stringify([{...row,transport}]));
    document.dispatchEvent(new CustomEvent('pendientes:transport-changed',{detail:{id:'row-1',transport}}));
    expect(root.innerHTML).toMatch(new RegExp(`data-patient-id="row-1"[\\s\\S]*?<b>${transport}<\\/b>`));
  }

  for(const tab of ['RX','TAC','USG','Piso','RX','TAC','USG','Piso','RX','Piso']){
    app.selectCategoryTab(tab);
    expect(root.innerHTML).toContain(`data-active-category="${tab}"`);
  }

  localStorage.setItem('pendientes-table-v2',JSON.stringify([{...row,transport:'Silla',status:'Realizado'}]));
  document.dispatchEvent(new CustomEvent('pendientes:status-changed',{detail:{id:'row-1',status:'Realizado'}}));
  expect(root.innerHTML).not.toContain('data-id="row-1"');
  expect(root.innerHTML).toContain('aria-label="0 pendientes"');
  expect(JSON.parse(localStorage.getItem('pendientes-table-v2'))[0].status).toBe('Realizado');
});

test('los flujos de Piso y TAC ya no dependen de recargar ni de una animación',()=>{
  const app=readFileSync('public/turno-rx/app-v16.js','utf8');
  const floor=readFileSync('public/turno-rx/floor-workflow-v42.js','utf8');
  const tac=readFileSync('public/turno-rx/tac-flow-v42.js','utf8');
  const index=readFileSync('public/turno-rx/index.html','utf8');
  const css=readFileSync('public/turno-rx/interaction-hotfix-v58.css','utf8');

  expect(app).toContain("document.addEventListener('pendientes:transport-changed',syncRowsFromStorageAndRender)");
  expect(app).toContain("document.addEventListener('pendientes:status-changed',syncRowsFromStorageAndRender)");
  expect(floor).toContain("pendientes:status-changed");
  expect(tac).toContain("pendientes:status-changed");
  expect(floor).not.toContain('location.reload()');
  expect(tac).not.toContain('location.reload()');
  expect(index).not.toContain('microinteractions-v57');
  expect(css).toContain('pointer-events: none !important');
});
