import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';

const index=readFileSync('public/turno-rx/index.html','utf8');
const source=readFileSync('public/turno-rx/app-v16.js','utf8');
const css=readFileSync('public/turno-rx/category-tabs-v49.css','utf8');
const stability=readFileSync('public/turno-rx/stability.js','utf8');
const sw=readFileSync('public/turno-rx/sw.js','utf8');

const localStorage={
  data:new Map(),
  getItem(key){return this.data.has(key)?this.data.get(key):null;},
  setItem(key,value){this.data.set(key,String(value));},
  removeItem(key){this.data.delete(key);},
  clear(){this.data.clear();}
};
globalThis.localStorage=localStorage;
const app=await import('../public/turno-rx/app-v16.js');

test('define cuatro pestañas accesibles y un único panel activo',()=>{
  expect(source).toContain("const CATEGORY_TABS=['Piso','RX','TAC','USG']");
  expect(source).toContain('role="tablist"');
  expect(source).toContain('role="tabpanel"');
  expect(source).toContain('aria-selected');
  expect(source).toContain('aria-controls="category-panel"');
});

test('clasifica globalmente sin depender de la pestaña visible',()=>{
  expect(app.categoryTabForRow({category:'Piso',target:'72'})).toBe('Piso');
  expect(app.categoryTabForRow({category:'Rayos X',target:'Tórax'})).toBe('RX');
  expect(app.categoryTabForRow({category:'TAC',target:'TAC de cráneo'})).toBe('TAC');
  expect(app.categoryTabForRow({category:'USG',target:'USG abdominal'})).toBe('USG');
});

test('cada contador y panel usa exclusivamente pendientes de su categoría',()=>{
  const list=[
    {category:'Piso',status:'Pendiente'},
    {category:'Piso',status:'Realizado'},
    {category:'Rayos X',status:'Pendiente'},
    {category:'TAC',status:'Pendiente'},
    {category:'USG',status:'Pendiente'}
  ];
  expect(app.pendingCounts(list)).toEqual({Piso:1,RX:1,TAC:1,USG:1});
  expect(app.rowsForCategoryTab(list,'Piso')).toHaveLength(1);
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
  expect(index).toMatch(/app-v16\.js\?v=87/);
  expect(index).toMatch(/stability-guard-v66\.js\?v=66/);
  expect(index).toMatch(/review-confidence-v67\.js\?v=70/);
  expect(index).toMatch(/photo-fingerprint-history-v70\.js\?v=70/);
  expect(index).toMatch(/photo-dedupe-v68\.js\?v=70/);
  expect(index).toMatch(/stability\.js\?v=20260818\.1/);
  expect(index).toMatch(/manual-category-v72\.js\?v=72/);
  expect(sw).toMatch(/pendientes-shell-20260818-7/);
  expect(sw).toMatch(/category-tabs-v49\.css\?v=1/);
  expect(sw).toMatch(/stability-guard-v66\.js\?v=66/);
  expect(sw).toMatch(/review-confidence-v67\.js\?v=70/);
  expect(sw).toMatch(/photo-fingerprint-history-v70\.js\?v=70/);
  expect(sw).toMatch(/photo-dedupe-v68\.js\?v=70/);
  expect(sw).toMatch(/stability\.js\?v=20260818\.1/);
  expect(sw).toMatch(/manual-category-v72\.js\?v=72/);
  expect(source).toMatch(/unseenCategoryTabs/);expect(source).toMatch(/renderPhotoQueue\(\)/);
  expect(css).toMatch(/min-height:44px/);
  expect(stability).toContain("document.addEventListener('pointerdown'");
  expect(stability).toContain("setStatus(g.id,'Realizado')");
  expect(stability).toContain("setStatus(g.id,'Pendiente')");
});
