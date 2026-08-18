import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {formatPatientName} from '../public/turno-rx/name-format-v23.js';

const read=(path)=>readFileSync(path,'utf8');
const index=read('public/turno-rx/index.html');
const css=read('public/turno-rx/compact-v17.css');
const js=read('public/turno-rx/compact-v17.js');
const transport=read('public/turno-rx/transport-v20.js');
const sw=read('public/turno-rx/sw.js');

describe('Pendientes vista compacta',()=>{
  it('carga la capa compacta sin quitar la app principal',()=>{
    expect(index).toContain('/turno-rx/app-v16.js?v=2');
    expect(index).toContain('/turno-rx/compact-v17.js?v=2');
    expect(index).toContain('/turno-rx/compact-v17.css?v=4');
    expect(index).toContain('/turno-rx/transport-v20.js?v=2');
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

  it('muestra nombres primero, apellidos después y todo en mayúsculas',()=>{
    expect(formatPatientName('Salazar Liliana')).toBe('LILIANA SALAZAR');
    expect(formatPatientName('Estela Santillana Romo')).toBe('ESTELA SANTILLANA ROMO');
    expect(formatPatientName('CAZARES GUAJARDO EDGAR DAVID')).toBe('EDGAR DAVID CAZARES GUAJARDO');
    expect(formatPatientName('Pérez López, Juan Carlos')).toBe('JUAN CARLOS PÉREZ LÓPEZ');
  });

  it('fuerza shell v23 y mantiene APIs fuera de caché',()=>{
    expect(sw).toContain("turno-rx-shell-v23");
    expect(sw).toContain('/turno-rx/compact-v17.css?v=4');
    expect(sw).toContain('/turno-rx/compact-v17.js?v=2');
    expect(sw).toContain('/turno-rx/transport-v20.js?v=2');
    expect(sw).toContain('/turno-rx/name-format-v23.js?v=1');
    expect(sw).toContain("url.pathname.startsWith('/api/')");
  });
});
