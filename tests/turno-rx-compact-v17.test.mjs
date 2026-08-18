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
    expect(index).toContain('/turno-rx/elegant-v30.css?v=1');
    expect(index).toContain('/turno-rx/adaptive-row-v26.js?v=1');
    expect(index).toContain('/turno-rx/cama-label-v28.js?v=1');
    expect(index).toContain('/turno-rx/transport-v20.js?v=3');
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

  it('aprovecha los huecos de Origen y Traslado para Paciente y Estudio',()=>{
    expect(spacing).toContain('.imaging-table col:nth-child(1) { width: 8% !important; }');
    expect(spacing).toContain('.imaging-table col:nth-child(2) { width: 48% !important; }');
    expect(spacing).toContain('.imaging-table col:nth-child(3) { width: 19% !important; }');
    expect(spacing).toContain('.imaging-table col:nth-child(4) { width: 25% !important; }');
    expect(spacing).toContain('width: max-content !important');
  });

  it('pasa a dos lineas con nombres arriba y apellidos abajo si falta espacio',()=>{
    expect(adaptiveJs).toContain('isOverflowing(name)');
    expect(adaptiveJs).toContain("row.dataset.studyNeedsSpace==='1'");
    expect(adaptiveJs).toContain("row.classList.add('adaptive-two-line-v26')");
    expect(adaptiveJs).toContain('node.dataset.givenNames=parts.given');
    expect(adaptiveJs).toContain('node.dataset.surnames=parts.surnames');
    expect(adaptiveCss).toContain('content:attr(data-given-names)');
    expect(adaptiveCss).toContain('content:attr(data-surnames)');
    expect(adaptiveCss).toContain('.imaging-table.study-wide-v26 col:nth-child(4){width:33% !important;}');
  });

  it('amplia tipografia y vuelve a mostrar edad y sexo debajo del paciente',()=>{
    expect(font).toContain('.imaging-table .patient-name');
    expect(font).toContain('font-size:13.4px !important');
    expect(font).toContain('.imaging-table .age-line');
    expect(font).toContain('display:block !important');
    expect(font).toContain('font-size:10.5px !important');
    expect(font).toContain('.imaging-table .transport-main');
    expect(font).toContain('font-size:12px !important');
    expect(font).toContain('.imaging-table .study-cell');
    expect(font).toContain('font-size:13px !important');
  });

  it('muestra Cama en vez de Origen solo en imagenologia',()=>{
    expect(camaLabel).toContain("firstHeader.textContent='Cama'");
    expect(camaLabel).toContain("cell.setAttribute('data-label','Cama')");
    expect(camaLabel).toContain("root.querySelectorAll?.('.imaging-table')");
  });

  it('mantiene la X accesible en fichas y edición largas',()=>{
    expect(stickyClose).toContain('.sheet-backdrop,');
    expect(stickyClose).toContain('.compact-detail-backdrop');
    expect(stickyClose).toContain('env(safe-area-inset-top)');
    expect(stickyClose).toContain('.sheet-head,');
    expect(stickyClose).toContain('.compact-detail-head');
    expect(stickyClose).toContain('position: sticky !important');
    expect(stickyClose).toContain('top: 0 !important');
    expect(stickyClose).toContain('.close-btn,');
    expect(stickyClose).toContain('.compact-detail-close');
    expect(stickyClose).toContain('min-width: 44px !important');
  });

  it('usa fondo negro y un reparto más simétrico sin cortar Camilla',()=>{
    expect(index).toContain('<meta name="theme-color" content="#000000"');
    expect(elegant).toContain('background:#000 !important');
    expect(elegant).toContain('.imaging-table col:nth-child(1){width:8% !important;}');
    expect(elegant).toContain('.imaging-table col:nth-child(2){width:40% !important;}');
    expect(elegant).toContain('.imaging-table col:nth-child(3){width:24% !important;}');
    expect(elegant).toContain('.imaging-table col:nth-child(4){width:28% !important;}');
    expect(elegant).toContain('.imaging-table .transport-main b');
    expect(elegant).toContain('text-overflow:clip !important');
  });

  it('usa un solo encabezado y oculta los datos clínicos de la lista',()=>{
    expect(css).toContain('display: table-header-group !important');
    expect(css).toContain('.imaging-table .imaging-row td::before');
    expect(css).toContain('content: none !important');
    expect(css).toContain('.imaging-table thead th:nth-child(n+5)');
    expect(css).toContain('.imaging-table .imaging-row td:nth-child(n+5)');
  });

  it('abre detalle al tocar paciente y conserva editar/quitar',()=>{
    expect(js).toContain("event.target.closest?.('.imaging-row')");
    expect(js).toContain('openDetails(row)');
    expect(js).toContain('compact-detail-edit');
    expect(js).toContain('compact-detail-remove');
    expect(js).toContain("['Diagnóstico / dato clínico'");
    expect(js).toContain("['Qué significa'");
    expect(js).toContain("['Oxígeno'");
  });

  it('resume el estudio a anatomía y conserva tórax primero',()=>{
    expect(js).toContain('function conciseStudy(value)');
    expect(js).toContain("add(portable ? 'Tórax portátil' : 'Tórax'");
    expect(js).toContain("add('Abdomen'");
    expect(js).toContain("add('Cráneo'");
    expect(js).toContain("detect('Pie'");
    expect(js).toContain("regions.map((item) => item.label).join(' + ')");
  });

  it('muestra Silla o Camilla sin la palabra probable',()=>{
    expect(transport).toContain("label: 'Silla'");
    expect(transport).toContain("label: 'Camilla'");
    expect(transport).not.toContain("label: 'Silla probable'");
    expect(transport).not.toContain("label: 'Camilla probable'");
    expect(transport).toContain('strongCamilla');
    expect(transport).toContain('likelyChairStudy');
    expect(transport).toContain('ambiguousMobilityStudy');
    expect(transport).toContain('transportRank(a) - transportRank(b)');
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

  it('fuerza shell v31 y mantiene APIs fuera de caché',()=>{
    expect(sw).toContain("turno-rx-shell-v31");
    expect(sw).toContain('/turno-rx/compact-v17.css?v=4');
    expect(sw).toContain('/turno-rx/one-line-v24.css?v=1');
    expect(sw).toContain('/turno-rx/space-v25.css?v=1');
    expect(sw).toContain('/turno-rx/adaptive-row-v26.css?v=1');
    expect(sw).toContain('/turno-rx/font-v27.css?v=1');
    expect(sw).toContain('/turno-rx/sticky-close-v29.css?v=1');
    expect(sw).toContain('/turno-rx/elegant-v30.css?v=1');
    expect(sw).toContain('/turno-rx/adaptive-row-v26.js?v=1');
    expect(sw).toContain('/turno-rx/cama-label-v28.js?v=1');
    expect(sw).toContain('/turno-rx/compact-v17.js?v=2');
    expect(sw).toContain('/turno-rx/transport-v20.js?v=3');
    expect(sw).toContain('/turno-rx/name-format-v23.js?v=1');
    expect(sw).toContain("url.pathname.startsWith('/api/')");
  });
});
