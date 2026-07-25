import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const main=read('src/main.tsx');
const app=read('src/HectorChatApp.tsx');
const css=read('src/hector-chat.css');
const sw=read('public/sw.js');

describe('interfaz elegante de Héctor OS',()=>{
  it('monta únicamente la nueva experiencia de chat',()=>{
    expect(main).toContain("import {HectorChatApp} from './HectorChatApp'");
    expect(main).toContain('<HectorChatApp/>');
    expect(main).not.toContain('HectorASIEvolutionApp');
    expect(main).not.toContain('TrainingOverlay');
  });

  it('mantiene la composición visual aprobada',()=>{
    expect(app).toContain('¿Qué quieres crear hoy?');
    expect(app).toContain('Crear imagen');
    expect(app).toContain('Investigar');
    expect(app).toContain('Escribir');
    expect(app).toContain('Resolver');
    expect(app).toContain('Pregunta lo que quieras…');
    expect(css).toContain('.hcRuntime');
    expect(css).toContain('.hcQuickActions');
    expect(css).toContain('.hcComposer');
  });

  it('conserva inteligencia y funciones reales',()=>{
    expect(app).toContain('api.chat(requestText,conversationId');
    expect(app).toContain('api.vision(selected.file,userContent)');
    expect(app).toContain('api.upload(selected.file)');
    expect(app).toContain('api.conversationMessages(id)');
    expect(app).toContain("reasoning==='high'?'force':'auto'");
    expect(app).toContain('SpeechRecognition');
  });

  it('protege la escritura y las zonas seguras en iPhone',()=>{
    expect(app).toContain("window.matchMedia('(min-width: 901px) and (pointer: fine)').matches");
    expect(app).toContain("element.style.height='auto'");
    expect(css).toContain('env(safe-area-inset-top)');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('100dvh');
  });

  it('muestra atribución real y no una marca fija de modelo',()=>{
    expect(app).toContain("message?.model||message?.provider||'Héctor'");
    expect(app).toContain("busy?'HÉCTOR • RAZONANDO'");
    expect(app).not.toContain('GPT-5.6 • RAZONANDO');
  });

  it('retira el shell PWA anterior',()=>{
    expect(sw).toContain("const CACHE='hector-elegant-chat-v5'");
    expect(sw).toContain("fetch(request,{cache:'no-store'})");
  });
});
