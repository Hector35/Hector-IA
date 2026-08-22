import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const workflow=read('.github/workflows/pwa-browser-production-audit.yml');
const runner=read('scripts/pwa-browser-audit.mjs');
const registry=JSON.parse(read('config/pwa-registry.json'));

describe('interactive PWA browser production audit',()=>{
  it('runs only after a successful production deploy or explicit dispatch',()=>{
    expect(workflow).toContain('workflows: ["Deploy Production"]');
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("context: 'pwa/browser-production-audit'");
  });

  it('uses both Safari-like mobile WebKit and Chromium PWA verification',()=>{
    expect(runner).toContain("devices['iPhone 13']");
    expect(runner).toContain('webkit.launch');
    expect(runner).toContain('chromium.launch');
    expect(runner).toContain('navigator.serviceWorker.register');
    expect(runner).toContain('context.setOffline(true)');
  });

  it('derives surfaces from the canonical registry instead of inventing another PWA',()=>{
    for(const pwa of registry.installablePwas){
      expect(runner).not.toContain(`canonicalPath:'${pwa.canonicalPath}'`);
    }
    expect(runner).toContain("config/pwa-registry.json");
    expect(registry.installablePwas.map((pwa:any)=>pwa.id)).toEqual(expect.arrayContaining(['hector-os','hector-agent','pendientes']));
  });

  it('limits browser navigation to production same-origin and uses an isolated test session',()=>{
    expect(runner).toContain('isSameOrigin');
    expect(runner).toContain("route.abort('blockedbyclient')");
    expect(workflow).toContain("chatgpt-test@hectoros.invalid");
    expect(workflow).toContain("DELETE FROM sessions WHERE id='$SESSION_ID'");
  });

  it('keeps interactive scenarios non-destructive',()=>{
    expect(runner).toContain("action:'category-tab'");
    expect(runner).toContain("action:'tab'");
    expect(runner).not.toContain('createGoalBtn');
    expect(runner).not.toContain('addMemoryBtn');
    expect(runner).not.toContain('stopBtn');
  });
});
