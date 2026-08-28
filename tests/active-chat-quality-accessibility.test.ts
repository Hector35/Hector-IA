import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const main=read('src/main.tsx');
const app=read('src/PatientShiftApp.tsx');
const a11y=read('src/patient-shift-accessibility.css');

describe('canonical surfaces and patient shift accessibility',()=>{
  it('mounts CodexApp as the active Héctor OS surface',()=>{
    expect(main).toContain("import {CodexApp} from './CodexApp'");
    expect(main).toContain('<CodexApp/>');
    expect(main).toContain("import './codex-mobile.css'");
    expect(main).not.toContain('PatientShiftApp');
  });

  it('provides labelled navigation and status feedback',()=>{
    expect(app).toContain('aria-label="Secciones del turno"');
    expect(app).toContain('role="status"');
    expect(app).toContain('aria-label="Resumen de Rayos X"');
    expect(app).toContain('aria-label="Resumen de pacientes a piso"');
    expect(app).toContain('aria-label="Cerrar"');
  });

  it('supports camera capture with an accessible visible trigger',()=>{
    expect(app).toContain('type="file"');
    expect(app).toContain('accept="image/*"');
    expect(app).toContain('capture="environment"');
    expect(app).toContain('htmlFor="xray-photo"');
    expect(app).toContain('Tomar / subir foto');
  });

  it('protects touch targets, focus, safe areas and accessibility media modes',()=>{
    expect(a11y).toContain('min-height:48px');
    expect(a11y).toContain(':focus-visible');
    expect(a11y).toContain('env(safe-area-inset-top)');
    expect(a11y).toContain('env(safe-area-inset-bottom)');
    expect(a11y).toContain('@media(prefers-reduced-motion:reduce)');
    expect(a11y).toContain('@media(prefers-contrast:more)');
    expect(a11y).toContain('@media(forced-colors:active)');
  });
});
