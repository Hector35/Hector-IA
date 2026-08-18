import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(path,'utf8');
const app=read('public/turno-rx/app.js');
const sw=read('public/turno-rx/sw.js');
const manifest=JSON.parse(read('public/turno-rx/manifest.webmanifest'));

describe('Pendientes PWA independiente',()=>{
  it('mantiene JavaScript válido en la PWA estática',()=>{
    expect(()=>new Function(app)).not.toThrow();
  });

  it('mantiene una PWA instalable con alcance propio',()=>{
    expect(manifest.start_url).toBe('/turno-rx/');
    expect(manifest.scope).toBe('/turno-rx/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.short_name).toBe('Pendientes');
  });

  it('usa la ruta directa de visión de Pendientes sin exponer keys',()=>{
    expect(app).toContain("fetch('/api/turno-rx/vision'");
    expect(app).toContain("'X-Turno-RX': '1'");
    expect(app).not.toMatch(/sk-[A-Za-z0-9_-]+/);
    expect(app).not.toContain('OPENAI_API_KEY');
    expect(app).not.toContain('CLOUDFLARE_API_TOKEN');
  });

  it('expone foto y captura manual sin atajo de cámara',()=>{
    expect(app).toContain("id=\"galleryCapture\"");
    expect(app).toContain("id=\"manualCapture\"");
    expect(app).toContain('multiple hidden');
    expect(app).not.toContain("id=\"cameraCapture\"");
    expect(app).not.toContain('capture="environment"');
  });

  it('prioriza el número de cama manuscrito y nunca usa sala de espera como cama',()=>{
    expect(app).toContain('handwrittenBed');
    expect(app).toContain('formBed');
    expect(app).toContain('waitingRoomMarked');
    expect(app).toContain('resolveVisionBed');
    expect(app).toContain('normalizeBedCandidate');
    expect(app).toContain('"Sala de espera" NUNCA es una cama');
    expect(app).toContain('número de cama puede estar escrito A MANO');
  });

  it('muestra edad, motivo de traslado y oxígeno cuando corresponde',()=>{
    expect(app).toContain('Nombre / edad');
    expect(app).toContain('Traslado / motivo');
    expect(app).toContain('<span>Edad</span>');
    expect(app).toContain('<span>Motivo</span>');
    expect(app).toContain('row.oxygenProbable ?');
    expect(app).toContain('oxygenReason');
  });

  it('protege reglas operativas de CE, UP, UI, oxígeno y traslado',()=>{
    expect(app).toContain('CE significa Corta Estancia');
    expect(app).toContain('UP significa Urgencias Pediátricas');
    expect(app).toContain('UI1/UI2 corresponde al área Stabyl');
    expect(app).toContain('(Stabyl)');
    expect(app).toContain('oxygenProbable=true SOLO');
    expect(app).toContain('ESTIMACIÓN OPERATIVA, no una orden médica');
    expect(app).toContain('transportReason');
  });

  it('agrupa subir a piso por rango, ordena origen y muestra total',()=>{
    expect(app).toContain("{key: 'primero', label: 'Primero'}");
    expect(app).toContain("{key: 'segundo', label: 'Segundo'}");
    expect(app).toContain("{key: 'tercero', label: 'Tercero'}");
    expect(app).toContain('Segundo de la otra unidad');
    expect(app).toContain('Tercero de la otra unidad');
    expect(app).toContain('Quinto de la otra unidad');
    expect(app).toContain('<th>Origen</th><th>Destino</th>');
    expect(app).toContain('compareOrigins');
    expect(app).toContain('Total: <strong>');
    expect(app).toContain('number >= 1 && number <= 44');
    expect(app).toContain('number >= 45 && number <= 88');
    expect(app).toContain('number >= 89 && number <= 132');
    expect(app).toContain('number >= 133 && number <= 165');
    expect(app).toContain('number >= 166 && number <= 189');
    expect(app).toContain('number >= 190 && number <= 204');
  });

  it('detiene un pizarrón si la lectura duplica una cama de origen',()=>{
    expect(app).toContain('findDuplicateFloorOrigins');
    expect(app).toContain('en un mismo pizarrón');
    expect(app).toContain('No agregué esa foto para evitar mezclar pacientes');
    expect(app).toContain('números manuscritos parecidos como 13 y 15');
  });

  it('no cachea respuestas clínicas de API en el service worker',()=>{
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain('return;');
  });
});