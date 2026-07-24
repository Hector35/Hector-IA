import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const app=readFileSync('src/HectorASIEvolutionApp.tsx','utf8');
const consoleCss=readFileSync('src/hector-reboot.css','utf8');
const main=readFileSync('src/main.tsx','utf8');
const manifest=JSON.parse(readFileSync('model/hector-asi/evals/visible-growth-adversarial-v2.json','utf8'));

function indexOrFail(source,value){
  const index=source.indexOf(value);
  expect(index,`Missing ${value}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('Hector OS command-console adversarial contract',()=>{
  it('puts useful model evidence in the primary product instead of a decorative overlay',()=>{
    const workspace=indexOrFail(app,'function Workspace');
    const header=indexOrFail(app,'className={`hxRuntime');
    const chat=indexOrFail(app,'function ChatView');
    const system=indexOrFail(app,'function SystemView');
    const effective=indexOrFail(app,'className="hxEffective"');
    const route=indexOrFail(app,'className="hxRoute"');
    const gates=indexOrFail(app,'className="hxGates"');

    expect(header).toBeGreaterThan(workspace);
    expect(chat).toBeGreaterThan(workspace);
    expect(effective).toBeGreaterThan(system);
    expect(route).toBeGreaterThan(effective);
    expect(gates).toBeGreaterThan(route);
    expect(app).not.toContain('function EvolutionSheet');
    expect(app).not.toContain('className="eaOrganism');
  });

  it('derives claims from the effective response and Stage 6 runtime instead of fixed progress',()=>{
    expect(app).toContain("const lastAssistant=useMemo(()=>[...messages].reverse().find(item=>item.role==='assistant'),[messages])");
    expect(app).toContain('const effective=messageModel(lastAssistant)');
    expect(app).toContain('const qwen=stage?.models?.qwen397');
    expect(app).toContain('const targetReady=Boolean(qwen?.endpointConfigured)');
    expect(app).toContain("typeof item.observed==='number'");
    expect(app).toContain("'Sin conteo integrado confirmado'");
    expect(app).not.toMatch(/Inteligencia:\s*\d|ASI completada:\s*\d|Neuronas:\s*[+\d]|progreso:\s*\d+%/i);
  });

  it('loads the replacement design system and includes a compact mobile viewport guard',()=>{
    expect(main).toContain("import './hector-reboot.css'");
    expect(main).not.toContain("import './hector-asi-evolution-compact.css'");
    expect(consoleCss).toContain('@media(max-width:900px)');
    expect(consoleCss).toContain('.hxMobileNav{position:fixed');
    expect(consoleCss).toContain('height:calc(100dvh - 66px - env(safe-area-inset-bottom))');
    expect(consoleCss).toContain('@media(max-width:620px)');
    expect(consoleCss).not.toMatch(/\.hxEmpty\{[^}]*min-height:\s*(?:7\d\d|8\d\d|9\d\d|\d{4,})px/);
  });

  it('preserves accessible primary touch targets on the smallest supported view',()=>{
    const match=consoleCss.match(/\.hxAttach,\.hxSend\{[^}]*height:(\d+)px/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(manifest.mobileGates.minimumPrimaryTouchTargetPx);
    expect(consoleCss).toContain('height:calc(66px + env(safe-area-inset-bottom))');
  });

  it('keeps reduced-motion support and adds no browser-test dependency',()=>{
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    expect(consoleCss).toContain('@media(prefers-reduced-motion:reduce)');
    expect(pkg.devDependencies?.['@playwright/test']).toBeUndefined();
    expect(manifest.costUsd).toBe(0);
  });
});
