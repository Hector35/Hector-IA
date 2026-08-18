import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path)=>readFileSync(path,'utf8');
const index=read('public/turno-rx/index.html');
const css=read('public/turno-rx/compact-v17.css');
const js=read('public/turno-rx/compact-v17.js');
const sw=read('public/turno-rx/sw.js');

describe('Pendientes vista compacta',()=>{
  it('carga la capa compacta sin quitar la app principal',()=>{
    expect(index).toContain('/turno-rx/app-v16.js?v=2');
    expect(index).toContain('/turno-rx/compact-v17.js?v=2');
    expect(index).toContain('/turno-rx/compact-v17.css?v=3');
  });

  it('usa un solo encabezado y cuatro columnas operativas',()=>{
    expect(css).toContain('.imaging-table thead');
    expect(css).toContain('display: table-header-group !important');
    expect(css).toContain('.imaging-table .imaging-row td::before');
    expect(css).toContain('content: none !important');
    expect(css).toContain('.imaging-table thead th:nth-child(n+5)');
    expect(css).toContain('.imaging-table .imaging-row td:nth-child(n+5)');
    expect(css).toContain('overflow-x: hidden !important');
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

  it('fuerza shell v20 y mantiene APIs fuera de caché',()=>{
    expect(sw).toContain("turno-rx-shell-v20");
    expect(sw).toContain('/turno-rx/compact-v17.css?v=3');
    expect(sw).toContain('/turno-rx/compact-v17.js?v=2');
    expect(sw).toContain("url.pathname.startsWith('/api/')");
  });
});
