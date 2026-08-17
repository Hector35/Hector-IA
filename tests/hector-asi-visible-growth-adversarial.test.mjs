import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const app=readFileSync('src/PatientShiftApp.tsx','utf8');
const css=readFileSync('src/patient-shift.css','utf8');
const a11y=readFileSync('src/patient-shift-accessibility.css','utf8');
const main=readFileSync('src/main.tsx','utf8');

describe('patient shift adversarial contract',()=>{
  it('keeps the requested workflow primary instead of the retired assistant shell',()=>{
    expect(main).toContain("import {PatientShiftApp} from './PatientShiftApp'");
    expect(main).not.toContain("import {HectorChatApp}");
    expect(app.indexOf('Rayos X')).toBeGreaterThanOrEqual(0);
    expect(app.indexOf('Pacientes a piso')).toBeGreaterThanOrEqual(0);
  });

  it('does not treat estimates as confirmed medical orders',()=>{
    expect(app).toContain('transport no es una orden médica');
    expect(app).toContain('Silla/camilla y oxígeno son estimaciones de apoyo, no indicaciones médicas');
    expect(app).toContain('Revisa antes de guardar');
    expect(app).toContain('Por definir');
  });

  it('prevents oxygen overcalling from weak clues',()=>{
    expect(app).toContain('oxygenProbable=true SOLO');
    expect(app).toContain('hipoxemia o SpO2 baja');
    expect(app).toContain('No lo marques solo por edad, dolor torácico, trauma');
    expect(app).toContain("oxygenReason: Boolean(data.oxygenProbable) ? String(data.oxygenReason ?? '').trim() : ''");
  });

  it('preserves CE and other areas as areas instead of assuming ordinary beds',()=>{
    expect(app).toContain('no confundas CE con cama');
    expect(app).toContain('C#15, CE1, UA16');
    expect(app).toContain('C#11, CE1, UP');
  });

  it('has compact mobile layout and safe touch behavior without new browser dependency',()=>{
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    expect(css).toContain('@media(max-width:700px)');
    expect(css).toContain('grid-template-columns:1fr 1fr');
    expect(a11y).toContain('min-height:48px');
    expect(a11y).toContain('@media(prefers-reduced-motion:reduce)');
    expect(pkg.devDependencies?.['@playwright/test']).toBeUndefined();
  });
});
