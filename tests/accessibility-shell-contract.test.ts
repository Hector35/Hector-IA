import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const app=read('src/HectorASIEvolutionApp.tsx');
const css=read('src/hector-reboot.css');
const evidence=JSON.parse(read('model/hector-asi/ui-quality-evidence.json'));

describe('chat-first accessibility contract',()=>{
  it('provides keyboard navigation and status semantics',()=>{
    expect(app).toContain('Saltar al contenido principal');
    expect(app).toContain('id="hxMain"');
    expect(app).toContain('tabIndex={-1}');
    expect(app).toContain('aria-current={view===item.id');
    expect(app).toContain('role="status"');
    expect(app).toContain('aria-live="polite"');
    expect(app).toContain('role="progressbar"');
  });

  it('keeps chat primary and exposes the quality cockpit without hidden navigation',()=>{
    expect(app).toContain("useState<View>('chat')");
    expect(app).toContain("setPrompt('/auditar-10-10')");
    expect(app).toContain('<QualityCockpit');
    expect(app).toContain('api.systemQuality()');
    expect(evidence.chatFirst).toMatchObject({defaultView:'chat',qualityCockpitVisibleInSystem:true,allPrimaryActionsReachableFromChat:true});
  });

  it('uses offline-safe fonts, visible focus and at least 44px interactive targets',()=>{
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    expect(css).toContain('.hxSkip:focus');
    expect(css).toContain('outline:3px solid var(--hx-accent)');
    expect(css).toMatch(/min-height:44px/);
    expect(css).toContain('@media(prefers-reduced-motion:reduce)');
    expect(css).toContain('@media(prefers-contrast:more)');
    expect(css).toContain('@media(forced-colors:active)');
    expect(evidence.accessibility).toMatchObject({minimumTouchTargetPx:44,reducedMotion:true,increasedContrast:true,forcedColors:true,externalFontRequests:false,automatedContractAudit:true,manualWcagAudit:false});
  });
});
