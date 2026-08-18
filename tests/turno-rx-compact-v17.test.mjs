import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {formatPatientName} from '../public/turno-rx/name-format-v23.js';

const read=(path)=>readFileSync(path,'utf8');
const index=read('public/turno-rx/index.html');
const css=read('public/turno-rx/compact-v17.css');
const oneLine=read('public/turno-rx/one-line-v24.css');
const spacing=read('public/turno-rx/space-v25.css');
const adaptiveCss=read('public/turno-rx/adaptive-row-v26.css');
const adaptiveJs=read('public/turno-rx/adaptive-row-v26.js');
const font=read('public/turno-rx/font-v27.css');
const camaLabel=read('public/turno-rx/cama-label-v28.js');
const stickyClose=read('public/turno-rx/sticky-close-v29.css');
const elegant=read('public/turno-rx/elegant-v30.css');
const polish=read('public/turno-rx/polish-v32.js');
const redesign=read('public/turno-rx/full-redesign-v33.css');
const redesignJs=read('public/turno-rx/full-redesign-v33.js');
const light=read('public/turno-rx/light-theme-v34.css');
const js=read('public/turno-rx/compact-v17.js');
const transport=read('public/turno-rx/transport-v20.js');
const sw=read('public/turno-rx/sw.js');

describe('Pendientes vista compacta',()=>{
  it('carga la capa compacta sin quitar la app principal',()=>{
    expect(index).toContain('/turno-rx/app-v16.js?v=2');
    expect(index).toContain('/turno-rx/compact-v17.js?v=2');
    expect(index).toContain('/turno-rx/compact-v17.css?v=4');
    expect(index).toContain('/turno-rx/one-line-v24.css?v=1');
    expect(index).toContain('/turno-rx/space-v25.css?v=1');
    expect(index).toContain('/turno-rx/adaptive-row-v26.css?v=1');
    expect(index).toContain('/turno-rx/font-v27.css?v=1');
    expect(index).toContain('/turno-rx/sticky-close-v29.css?v=1');
    expect(index).toContain('/turno-rx/elegant-v30.css?v=2');
    expect(index).toContain('/turno-rx/adaptive-row-v26.js?v=1');
    expect(index).toContain('/turno-rx/cama-label-v28.js?v=1');
    expect(index).toContain('/turno-rx/transport-v20.js?v=3');
    expect(index).toContain('/turno-rx/polish-v32.js?v=1');
    expect(index).toContain('/turno-rx/full-redesign-v33.css?v=1');
    expect(index).toContain('/turno-rx/full-redesign-v33.js?v=1');
    expect(index).toContain('/turno-rx/light-theme-v34.css?v=1');
    expect(index).toContain('type="module" src="/turno-rx/name-format-v23.js?v=1"');
  });

  it('mantiene una tabla real de cuatro columnas también en móvil',()=>{
    expect(css).toContain('.imaging-table colgroup { display: table-column-group !important; }');
    expect(css).toContain('.imaging-table tbody { display: table-row-group !important; }');
    expect(css).toContain('display: table-row !important');
    expect(css).toContain('display: table-cell !important');
    expect(css).toContain('.imaging-table col:nth-child(n+5)');
    expect(css).toContain('visibility: collapse !important');
    expect(css).toContain('overflow-x: hidden !important');
    expect(css).toContain('word-break: normal !important');
  });

  it('mantiene cada paciente en un solo renglon cuando cabe',()=>{
    expect(oneLine).toContain('.imaging-table .imaging-row td:nth-child(-n+4)');
    expect(oneLine).toContain('white-space: nowrap !important');
    expect(oneLine).toContain('text-overflow: ellipsis !important');
  });

  it('conserva capas anteriores y v33 mantiene el reparto estructural',()=>{
    expect(spacing).toContain('.imaging-table col:nth-child(1) { width: 8% !important; }');
    expect(elegant).toContain('.imaging-table col:nth-child(1){width:9% !important;}');
    expect(redesign).toContain('.imaging-table col:nth-child(1){width:11% !important;}');
    expect(redesign).toContain('.imaging-table col:nth-child(2){width:40% !important;}');
    expect(redesign).toContain('.imaging-table col:nth-child(3){width:23% !important;}');
    expect(redesign).toContain('.imaging-table col:nth-child(4){width:26% !important;}');
  });

  it('pasa a dos lineas con nombres arriba y apellidos abajo si falta espacio',()=>{
    expect(adaptiveJs).toContain('isOverflowing(name)');
    expect(adaptiveJs).toContain("row.dataset.studyNeedsSpace==='1'");
    expect(adaptiveJs).toContain("row.classList.add('adaptive-two-line-v26')");
    expect(adaptiveJs).toContain('node.dataset.givenNames=parts.given');
    expect(adaptiveJs).toContain('node.dataset.surnames=parts.surnames');
    expect(adaptiveCss).toContain('content:attr(data-given-names)');
    expect(adaptiveCss).toContain('content:attr(data-surnames)');
    expect(redesign).toContain('.imaging-row.adaptive-two-line-v26 .patient-name::before');
    expect(redesign).toContain('.imaging-row.adaptive-two-line-v26 .patient-name::after');
  });

  it('mantiene edad y sexo debajo del paciente con tipografía mayor',()=>{
    expect(font).toContain('.imaging-table .patient-name');
    expect(font).toContain('.imaging-table .age-line');
    expect(redesign).toContain('font-size:15.8px !important');
    expect(redesign).toContain('font-size:11.2px !important');
  });

  it('muestra Cama en vez de Origen solo en imagenologia',()=>{
    expect(camaLabel).toContain("firstHeader.textContent='Cama'");
    expect(camaLabel).toContain("cell.setAttribute('data-label','Cama')");
    expect(camaLabel).toContain("root.querySelectorAll?.('.imaging-table')");
  });

  it('mantiene la X accesible en fichas y edición largas',()=>{
    expect(stickyClose).toContain('env(safe-area-inset-top)');
    expect(stickyClose).toContain('position: sticky !important');
    expect(stickyClose).toContain('min-width: 44px !important');
    expect(redesign).toContain('.close-btn,');
    expect(redesign).toContain('.compact-detail-close{');
  });

  it('aplica tema claro clínico a toda la interfaz',()=>{
    expect(index).toContain('<meta name="theme-color" content="#edf3f7"');
    expect(light).toContain('--v34-bg:#edf3f7');
    expect(light).toContain('color-scheme:light');
    expect(light).toContain('.topbar{');
    expect(light).toContain('.capture-icon-btn.manual{');
    expect(light).toContain('.imaging-table .imaging-row td:nth-child(-n+4)');
    expect(light).toContain('background:rgba(255,255,255,.94) !important');
    expect(light).toContain('.compact-detail-sheet,');
    expect(light).toContain('.capture-sheet{');
    expect(light).toContain('.floor-table-wrap{');
    expect(light).toContain('.empty-row td{');
  });

  it('resalta Tórax y agrega feedback táctil sin alterar el texto del estudio',()=>{
    expect(polish).toContain("split(/(Tórax)/gi)");
    expect(polish).toContain("strong.className = 'study-torax-v32'");
    expect(polish).toContain("row.classList.add('is-pressed-v32')");
    expect(polish).toContain("row.classList.remove('is-pressed-v32')");
    expect(redesign).toContain('.study-torax-v32');
    expect(redesign).toContain('.imaging-row.is-pressed-v32');
    expect(light).toContain('.study-torax-v32');
  });

  it('usa un solo encabezado y oculta los datos clínicos de la lista',()=>{
    expect(css).toContain('display: table-header-group !important');
    expect(css).toContain('.imaging-table .imaging-row td::before');
    expect(css).toContain('content: none !important');
    expect(css).toContain('.imaging-table thead th:nth-child(n+5)');
    expect(css).toContain('.imaging-table .imaging-row td:nth-child(n+5)');
    expect(redesign).toContain('.imaging-table thead th:nth-child(n+5){display:none !important;}');
  });

  it('abre detalle al tocar paciente y conserva editar/quitar',()=>{
    expect(js).toContain("event.target.closest?.('.imaging-row')");
    expect(js).toContain('openDetails(row)');
    expect(js).toContain('compact-detail-edit');
    expect(js).toContain('compact-detail-remove');
    expect(js).toContain("['Diagnóstico / dato clínico'");
    expect(js).toContain("['Qué significa'");
    expect(js).toContain("['Oxígeno'");
    expect(redesign).toContain('.compact-detail-item{');
  });

  it('resume el estudio a anatomía y conserva tórax primero',()=>{
    expect(js).toContain('function conciseStudy(value)');
    expect(js).toContain("add(portable ? 'Tórax portátil' : 'Tórax'");
    expect(js).toContain("regions.map((item) => item.label).join(' + ')");
  });

  it('muestra Silla o Camilla sin la palabra probable',()=>{
    expect(transport).toContain("label: 'Silla'");
    expect(transport).toContain("label: 'Camilla'");
    expect(transport).not.toContain("label: 'Silla probable'");
    expect(transport).not.toContain("label: 'Camilla probable'");
  });

  it('ordena por traslado, luego menor edad, mujer, tórax y cama',()=>{
    expect(transport).toContain('function chestRank(row)');
    const tr=transport.indexOf('transportRank(a) - transportRank(b)');
    const age=transport.indexOf('ageValue(a) - ageValue(b)');
    const sex=transport.indexOf('sexRank(a) - sexRank(b)');
    const chest=transport.indexOf('chestRank(a) - chestRank(b)');
    const origin=transport.indexOf('originValue(a) - originValue(b)');
    expect(tr).toBeGreaterThan(-1);
    expect(age).toBeGreaterThan(tr);
    expect(sex).toBeGreaterThan(age);
    expect(chest).toBeGreaterThan(sex);
    expect(origin).toBeGreaterThan(chest);
  });

  it('muestra nombres primero, apellidos después y todo en mayúsculas',()=>{
    expect(formatPatientName('Salazar Liliana')).toBe('LILIANA SALAZAR');
    expect(formatPatientName('Estela Santillana Romo')).toBe('ESTELA SANTILLANA ROMO');
    expect(formatPatientName('CAZARES GUAJARDO EDGAR DAVID')).toBe('EDGAR DAVID CAZARES GUAJARDO');
    expect(formatPatientName('Pérez López, Juan Carlos')).toBe('JUAN CARLOS PÉREZ LÓPEZ');
  });

  it('fuerza shell v34 y mantiene APIs fuera de caché',()=>{
    expect(sw).toContain("turno-rx-shell-v34");
    expect(sw).toContain('/turno-rx/elegant-v30.css?v=2');
    expect(sw).toContain('/turno-rx/polish-v32.js?v=1');
    expect(sw).toContain('/turno-rx/full-redesign-v33.css?v=1');
    expect(sw).toContain('/turno-rx/full-redesign-v33.js?v=1');
    expect(sw).toContain('/turno-rx/light-theme-v34.css?v=1');
    expect(sw).toContain('/turno-rx/transport-v20.js?v=3');
    expect(sw).toContain("url.pathname.startsWith('/api/')");
  });
});
