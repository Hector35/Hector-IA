import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const main=read('src/main.tsx');
const app=read('src/PatientShiftApp.tsx');
const css=read('src/patient-shift.css');

describe('superficies canónicas de Héctor',()=>{
  it('monta CodexApp como Héctor OS y mantiene el flujo clínico fuera del entry point',()=>{
    expect(main).toContain("import {CodexApp} from './CodexApp'");
    expect(main).toContain('<CodexApp/>');
    expect(main).toContain("import './codex-ui.css'");
    expect(main).not.toContain('PatientShiftApp');
    expect(main).not.toContain('HectorChatApp');
  });

  it('separa Rayos X y pacientes a piso',()=>{
    expect(app).toContain("type Tab = 'rayos' | 'piso'");
    expect(app).toContain('Rayos X');
    expect(app).toContain('Pacientes a piso');
    expect(app).toContain('Cama / área');
    expect(app).toContain('Destino');
  });

  it('usa visión para leer solicitudes y obliga a revisar antes de guardar',()=>{
    expect(app).toContain('api.vision(file, prompt)');
    expect(app).toContain('Extrae únicamente datos visibles en la imagen');
    expect(app).toContain('No inventes nombres, diagnósticos, camas, estudios ni valores clínicos');
    expect(app).toContain('Confirma la solicitud');
    expect(app).toContain('Agregar a Rayos X');
  });

  it('mantiene las reglas operativas de silla, camilla y oxígeno',()=>{
    expect(app).toContain("type Transport = 'Silla' | 'Camilla' | 'Por definir'");
    expect(app).toContain('transport no es una orden médica');
    expect(app).toContain('oxygenProbable=true SOLO');
    expect(app).toContain('No lo marques solo por edad, dolor torácico, trauma');
    expect(app).toContain('O₂ probable');
  });

  it('permite corregir, cambiar estado, borrar y copiar el corte',()=>{
    expect(app).toContain("type Status = 'Pendiente' | 'En traslado' | 'Realizado'");
    expect(app).toContain('editXRay(patient)');
    expect(app).toContain('removeXRay(patient.id)');
    expect(app).toContain('copyCurrentCut');
    expect(app).toContain('navigator.clipboard.writeText');
  });

  it('persiste el turno localmente y conserva una interfaz móvil',()=>{
    expect(app).toContain("const XRAY_KEY = 'turno-imss-rayos-v1'");
    expect(app).toContain("const FLOOR_KEY = 'turno-imss-piso-v1'");
    expect(app).toContain('localStorage.setItem');
    expect(css).toContain('@media(max-width:700px)');
    expect(css).toContain('.patient-table');
  });
});
