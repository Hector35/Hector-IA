import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const app=readFileSync('src/HectorChatApp.tsx','utf8');
const chatCss=readFileSync('src/hector-chat.css','utf8');
const mobileCss=readFileSync('src/hector-chat-mobile-refinement.css','utf8');
const main=readFileSync('src/main.tsx','utf8');
const manifest=JSON.parse(readFileSync('model/hector-asi/evals/visible-growth-adversarial-v2.json','utf8'));

function indexOrFail(source,value){
  const index=source.indexOf(value);
  expect(index,`Missing ${value}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('Hector OS elegant-chat adversarial contract',()=>{
  it('puts useful model evidence in the primary product instead of a decorative overlay',()=>{
    const workspace=indexOrFail(app,'function Workspace');
    const header=indexOrFail(app,'className={`hcRuntime');
    const thread=indexOrFail(app,'className="hcThread"');
    const system=indexOrFail(app,"panel==='system'");
    const modelList=indexOrFail(app,'className="hcModelList"');

    expect(header).toBeGreaterThan(workspace);
    expect(thread).toBeGreaterThan(workspace);
    expect(modelList).toBeGreaterThan(system);
    expect(app).not.toContain('TrainingOverlay');
    expect(app).not.toContain('function EvolutionSheet');
  });

  it('derives claims from effective responses and Stage 6 telemetry instead of fixed progress',()=>{
    expect(app).toContain("const lastAssistant=useMemo(()=>[...messages].reverse().find(message=>message.role==='assistant'),[messages])");
    expect(app).toContain("message?.model||message?.provider||'Héctor'");
    expect(app).toContain("busy?'HÉCTOR • RAZONANDO'");
    expect(app).toContain('Object.entries(stage.models)');
    expect(app).toContain("stage?.name||stage?.status");
    expect(app).toContain('Telemetría no disponible');
    expect(app).not.toMatch(/Inteligencia:\s*\d|ASI completada:\s*\d|Neuronas:\s*[+\d]|progreso:\s*\d+%/i);
  });

  it('loads the approved design system and includes compact mobile viewport guards',()=>{
    expect(main).toContain("import './hector-chat.css'");
    expect(main).toContain("import './hector-chat-mobile-refinement.css'");
    expect(main).not.toContain("import './hector-reboot.css'");
    expect(chatCss).toContain('@media(max-width:900px)');
    expect(chatCss).toContain('@media(max-width:520px)');
    expect(chatCss).toContain('height:100dvh');
    expect(chatCss).toContain('env(safe-area-inset-bottom)');
    expect(mobileCss).toContain('@media(max-width:350px)');
    expect(mobileCss).toContain('.hcBrand>b');
  });

  it('preserves accessible primary touch targets on the smallest supported view',()=>{
    const match=mobileCss.match(/\.hcAdd,\.hcMic,\.hcSend\{width:(\d+)px;height:(\d+)px/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(manifest.mobileGates.minimumPrimaryTouchTargetPx);
    expect(Number(match[2])).toBeGreaterThanOrEqual(manifest.mobileGates.minimumPrimaryTouchTargetPx);
    expect(app).toContain('aria-label="Adjuntar archivo"');
    expect(app).toContain('aria-label="Dictar mensaje"');
    expect(app).toContain('aria-label="Enviar"');
  });

  it('keeps reduced-motion support and adds no browser-test dependency',()=>{
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    expect(chatCss).toContain('@media(prefers-reduced-motion:reduce)');
    expect(pkg.devDependencies?.['@playwright/test']).toBeUndefined();
    expect(manifest.costUsd).toBe(0);
  });
});
