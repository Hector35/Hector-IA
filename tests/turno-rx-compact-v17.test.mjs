import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path)=>readFileSync(path,'utf8');
const index=read('public/turno-rx/index.html');
const css=read('public/turno-rx/compact-v17.css');
const js=read('public/turno-rx/compact-v17.js');
const sw=read('public/turno-rx/sw.js');

describe('Pendientes v17 vista compacta',()=>{
  it('carga la capa compacta sin quitar la app principal',()=>{
    expect(index).toContain('/turno-rx/app-v16.js?v=2');
    expect(index).toContain('/turno-rx/compact-v17.js?v=1');
    expect(index).toContain('/turno-rx/compact-v17.css?v=1');
  });

  it('deja visibles solo las cuatro columnas operativas en la lista',()=>{
    expect(css).toContain('.imaging-table th:nth-child(n+5)');
    expect(css).toContain('display: none !important');
    expect(css).toContain('.imaging-table .transport-reason');
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

  it('fuerza shell v17 y mantiene APIs fuera de caché',()=>{
    expect(sw).toContain("turno-rx-shell-v17");
    expect(sw).toContain('/turno-rx/compact-v17.js?v=1');
    expect(sw).toContain("url.pathname.startsWith('/api/')");
  });
});
