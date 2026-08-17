import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(path,'utf8');
const app=read('public/turno-rx/app.js');
const sw=read('public/turno-rx/sw.js');
const manifest=JSON.parse(read('public/turno-rx/manifest.webmanifest'));

describe('Turno RX PWA independiente',()=>{
  it('mantiene una PWA instalable con alcance propio',()=>{
    expect(manifest.start_url).toBe('/turno-rx/');
    expect(manifest.scope).toBe('/turno-rx/');
    expect(manifest.display).toBe('standalone');
  });

  it('usa el backend de visión existente sin exponer nuevas keys',()=>{
    expect(app).toContain("fetch('/api/vision'");
    expect(app).not.toMatch(/sk-[A-Za-z0-9_-]+/);
    expect(app).not.toContain('OPENAI_API_KEY');
    expect(app).not.toContain('CLOUDFLARE_API_TOKEN');
  });

  it('protege reglas operativas de CE, UP, oxígeno y traslado',()=>{
    expect(app).toContain('CE significa Corta Estancia');
    expect(app).toContain('UP significa Urgencias Pediátricas');
    expect(app).toContain('oxygenProbable=true SOLO');
    expect(app).toContain('Silla/Camilla es una estimación operativa, no una orden');
  });

  it('no cachea respuestas clínicas de API en el service worker',()=>{
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain('return;');
  });
});
