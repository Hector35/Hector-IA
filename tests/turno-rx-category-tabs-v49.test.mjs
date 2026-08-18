import {test,expect,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';

const storage=new Map();
globalThis.localStorage={getItem:(key)=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))};
const app=await import('../public/turno-rx/app-v16.js');
const source=readFileSync('public/turno-rx/app-v16.js','utf8');
const css=readFileSync('public/turno-rx/category-tabs-v49.css','utf8');
const index=readFileSync('public/turno-rx/index.html','utf8');
const sw=readFileSync('public/turno-rx/sw.js','utf8');

beforeEach(()=>storage.clear());

test('define cuatro pestañas accesibles y un único panel activo',()=>{
  expect(source).toMatch(/CATEGORY_TABS=\['Piso','RX','TAC','USG'\]/);
  expect(source).toMatch(/role="tablist"/);expect(source).toMatch(/role="tab"/);
  expect(source).toMatch(/aria-selected=/);expect(source).toMatch(/role="tabpanel"/);
  expect(source).toMatch(/visibleRows=rows\.filter/);
});

test('clasifica globalmente sin depender de la pestaña visible',()=>{
  expect(app.categoryTabForRow({category:'Piso',destination:'72'})).toBe('Piso');
  expect(app.categoryTabForRow({category:'Rayos X',target:'Tórax'})).toBe('RX');
  expect(app.categoryTabForRow({category:'TAC',target:'TAC de cráneo'})).toBe('TAC');
  expect(app.categoryTabForRow({category:'USG',target:'USG abdomen'})).toBe('USG');
});

test('cuenta solo pendientes, sin duplicar ni producir negativos',()=>{
  const rows=[
    {id:'1',category:'Piso',status:'Pendiente'},
    {id:'2',category:'Rayos X',status:'Pendiente'},
    {id:'3',category:'TAC',status:'Realizado'},
    {id:'4',category:'USG',status:'Pendiente'}
  ];
  expect(app.pendingCounts(rows)).toEqual({Piso:1,RX:1,TAC:0,USG:1});
  expect(app.pendingCounts([])).toEqual({Piso:0,RX:0,TAC:0,USG:0});
});

test('restaura pestaña y aplica prioridad Piso, RX, TAC, USG',()=>{
  expect(app.preferredCategoryTab([{category:'TAC',status:'Pendiente'}])).toBe('TAC');
  expect(app.preferredCategoryTab([{category:'Rayos X',status:'Pendiente'},{category:'Piso',status:'Pendiente'}])).toBe('Piso');
  expect(app.preferredCategoryTab([])).toBe('RX');
  localStorage.setItem('pendientes-active-category-v49',JSON.stringify('USG'));
  expect(app.preferredCategoryTab([{category:'Piso',status:'Pendiente'}])).toBe('USG');
});

test('integra pestañas debajo de captura y conserva cola progresiva y gestos',()=>{
  expect(index).toMatch(/category-tabs-v49\.css\?v=1/);expect(index).toMatch(/app-v16\.js\?v=6/);
  expect(sw).toMatch(/turno-rx-shell-v49-tac-category-tabs/);expect(sw).toMatch(/category-tabs-v49\.css\?v=1/);
  expect(source).toMatch(/unseenCategoryTabs/);expect(source).toMatch(/renderPhotoQueue\(\)/);
  expect(css).toMatch(/touch-action:pan-x/);expect(css).toMatch(/min-height:44px/);
  expect(readFileSync('public/turno-rx/floor-workflow-v42.js','utf8')).toMatch(/SWIPE_THRESHOLD/);
  expect(readFileSync('public/turno-rx/tac-flow-v42.js','utf8')).toMatch(/markRealizado/);
  expect(readFileSync('public/turno-rx/patient-detail-v39.js','utf8')).toMatch(/v39-detail-sheet/);
});
