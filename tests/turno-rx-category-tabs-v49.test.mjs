import {test,expect,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';

const storage=new Map();
globalThis.localStorage={getItem:(key)=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))};
const app=await import('../public/turno-rx/app-v16.js');
const source=readFileSync('public/turno-rx/app-v16.js','utf8');
const css=readFileSync('public/turno-rx/category-tabs-v49.css','utf8');
const stability=readFileSync('public/turno-rx/stability.js','utf8');
const index=readFileSync('public/turno-rx/index.html','utf8');
const sw=readFileSync('public/turno-rx/sw.js','utf8');

beforeEach(()=>storage.clear());

test('define cuatro pestañas accesibles y un único panel activo',()=>{
  expect(source).toMatch(/CATEGORY_TABS=\['Piso','RX','TAC','USG'\]/);
  expect(source).toMatch(/role="tablist"/);expect(source).toMatch(/role="tab"/);
  expect(source).toMatch(/aria-selected=/);expect(source).toMatch(/role="tabpanel"/);
  expect(source).toMatch(/visibleRows=rowsForCategoryTab/);
});

test('clasifica globalmente sin depender de la pestaña visible',()=>{
  expect(app.categoryTabForRow({category:'Piso',destination:'72'})).toBe('Piso');
  expect(app.categoryTabForRow({category:'Rayos X',target:'Tórax'})).toBe('RX');
  expect(app.categoryTabForRow({category:'TAC',target:'TAC de cráneo'})).toBe('TAC');
  expect(app.categoryTabForRow({category:'USG',target:'USG abdomen'})).toBe('USG');
  expect(app.categoryTabForRow({category:'',destination:'72',target:'72'})).toBe('Piso');
  expect(app.categoryTabForRow({category:'Otro',destination:'72',destinationFloor:'Segundo'})).toBe('Piso');
});

test('cada contador y panel usa exclusivamente pendientes de su categoría',()=>{
  const rows=[
    {id:'1',category:'Piso',status:'Pendiente'},
    {id:'2',category:'Rayos X',status:'Pendiente'},
    {id:'3',category:'TAC',status:'Realizado'},
    {id:'4',category:'USG',status:'Pendiente'},
    {id:'5',category:'Piso',status:'Realizado'},
    {id:'6',category:'Otro',destination:'72',status:'Pendiente'}
  ];
  expect(app.pendingCounts(rows)).toEqual({Piso:2,RX:1,TAC:0,USG:1});
  expect(app.rowsForCategoryTab(rows,'Piso').map((row)=>row.id)).toEqual(['1','6']);
  expect(app.rowsForCategoryTab(rows,'RX').map((row)=>row.id)).toEqual(['2']);
  expect(app.rowsForCategoryTab(rows,'TAC')).toEqual([]);
  expect(app.rowsForCategoryTab(rows,'USG').map((row)=>row.id)).toEqual(['4']);
  expect(app.pendingCounts([])).toEqual({Piso:0,RX:0,TAC:0,USG:0});
});

test('restaura pestaña y aplica prioridad Piso, RX, TAC, USG',()=>{
  expect(app.preferredCategoryTab([{category:'TAC',status:'Pendiente'}])).toBe('TAC');
  expect(app.preferredCategoryTab([{category:'Rayos X',status:'Pendiente'},{category:'Piso',status:'Pendiente'}])).toBe('Piso');
  expect(app.preferredCategoryTab([])).toBe('RX');
  localStorage.setItem('pendientes-active-category-v49',JSON.stringify('USG'));
  expect(app.preferredCategoryTab([{category:'Piso',status:'Pendiente'}])).toBe('USG');
});

test('integra pestañas con el runtime consolidado, cola progresiva y gesto único',()=>{
  expect(index).toMatch(/category-tabs-v49\.css\?v=1/);
  expect(index).toMatch(/app-v16\.js\?v=65/);
  expect(index).toMatch(/stability-guard-v66\.js\?v=66/);
  expect(index).toMatch(/stability\.js\?v=20260818\.1/);
  expect(sw).toMatch(/pendientes-shell-20260818-2/);
  expect(sw).toMatch(/category-tabs-v49\.css\?v=1/);
  expect(sw).toMatch(/stability-guard-v66\.js\?v=66/);
  expect(sw).toMatch(/stability\.js\?v=20260818\.1/);
  expect(source).toMatch(/unseenCategoryTabs/);expect(source).toMatch(/renderPhotoQueue\(\)/);
  expect(css).toMatch(/min-height:44px/);
  expect(stability).toContain("document.addEventListener('pointerdown'");
  expect(stability).toContain("setStatus(g.id,'Realizado')");
  expect(stability).toContain("setStatus(g.id,'Pendiente')");
});