import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const app=read('src/HectorASIEvolutionApp.tsx');
const training=read('src/TrainingOverlay.tsx');
const css=read('src/hector-reboot.css');
const trainingCss=read('src/training-overlay.css');
const serviceWorker=read('public/sw.js');

describe('interfaz Héctor OS 10/10',()=>{
  it('mantiene el chat como superficie única',()=>{
    expect(app).not.toContain("type View=");
    expect(app).not.toContain('hxMobileNav');
    expect(app).not.toContain('hxRail');
    expect(app).toContain('hxPanelBackdrop');
    expect(app).toContain('Nueva conversación');
  });

  it('protege la escritura en iPhone y autoexpande el compositor',()=>{
    expect(app).toContain("window.matchMedia('(min-width: 901px) and (pointer: fine)').matches");
    expect(app).toContain("element.style.height='auto'");
    expect(app).toContain('Math.min(element.scrollHeight,168)');
    expect(app).toContain('El botón ↑ envía el mensaje');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).not.toContain('.hxMobileNav');
  });

  it('integra la enseñanza dentro de cada respuesta',()=>{
    expect(app).toContain('hector:open-training');
    expect(app).toContain('<span>Corregir</span>');
    expect(training).toContain("window.addEventListener('hector:open-training',launch)");
    expect(training).not.toContain('hxTrainFab');
    expect(trainingCss).not.toContain('.hxTrainFab');
  });

  it('no presenta telemetría inventada cuando el backend falla',()=>{
    expect(app).toContain('Telemetría no disponible');
    expect(app).toContain('No se mostrarán cifras ni modelos predeterminados.');
    expect(app).not.toContain("Qwen/Qwen3.5-397B-A17B");
    expect(app).not.toContain("'262K'");
    expect(app).not.toContain("'17B'");
    expect(app).not.toContain("'V41'");
  });

  it('usa tipografía local compatible con la política de seguridad',()=>{
    expect(css).not.toContain('@import url(');
    expect(css).toContain('system-ui');
  });

  it('fuerza la sustitución del shell almacenado en iPhone',()=>{
    expect(serviceWorker).toContain("const CACHE='hector-chat-shell-v3'");
    expect(serviceWorker).toContain("fetch(request,{cache:'no-store'})");
  });
});
