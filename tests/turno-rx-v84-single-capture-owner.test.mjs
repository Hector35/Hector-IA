import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const index=readFileSync(new URL('../public/turno-rx/index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/turno-rx/sw.js',import.meta.url),'utf8');
const capture=readFileSync(new URL('../public/turno-rx/capture-fix-v80.js',import.meta.url),'utf8');
const interactions=readFileSync(new URL('../public/turno-rx/interaction-runtime-v85.js',import.meta.url),'utf8');
const detail=readFileSync(new URL('../public/turno-rx/patient-detail-history-v82.js',import.meta.url),'utf8');

function activeModuleSources(html){return [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map(m=>m[1]);}

describe('Pendientes v85 interaction consistency',()=>{
  it('loads the interaction-only runtime and does not execute legacy stability.js',()=>{
    const modules=activeModuleSources(index);
    expect(modules).toContain('/turno-rx/capture-fix-v80.js?v=81');
    expect(modules).toContain('/turno-rx/patient-detail-history-v82.js?v=83');
    expect(modules).toContain('/turno-rx/interaction-runtime-v85.js?v=85');
    expect(modules).not.toContain('/turno-rx/interaction-runtime-v84.js?v=84');
    expect(modules).not.toContain('/turno-rx/stability.js?v=20260818.1');
  });

  it('keeps vision ownership exclusively in the capture controller',()=>{
    expect(capture).toContain("fetch('/api/turno-rx/vision'");
    expect(interactions).not.toContain("fetch('/api/turno-rx/vision'");
    expect(interactions).not.toContain('VISION_PROMPT');
    expect(interactions).not.toContain("addEventListener('change'");
    expect(detail).not.toContain("fetch('/api/turno-rx/vision'");
    expect(detail).not.toContain('VISION_PROMPT');
  });

  it('preserves iPhone interaction responsibilities',()=>{
    expect(interactions).toContain("addEventListener('pointerdown'");
    expect(interactions).toContain("addEventListener('pointermove'");
    expect(interactions).toContain("addEventListener('pointerup'");
    expect(interactions).toContain("setStatus(g.id,'Realizado')");
    expect(interactions).toContain("setStatus(g.id,'Pendiente')");
    expect(interactions).toContain('transportCycle');
    expect(interactions).toContain("document.getElementById('cameraInput')?.click()");
  });

  it('clears stale automatic transport reasons after a manual override',()=>{
    expect(interactions).toContain("transportReason:''");
    expect(interactions).toContain('transportReasonAuto:automaticReason');
    expect(interactions).toContain('transport:true,transportReason:true');
  });

  it('uses the shared category normalizer for realized-tab grouping',()=>{
    expect(interactions).toContain('normalizeCategory');
    expect(interactions).toContain('function categoryTabFrom');
    expect(interactions).toContain("if(normalized==='Piso')return'Piso'");
    expect(interactions).toContain("if(normalized==='TAC')return'TAC'");
  });

  it('keeps the service worker coherent with the v85 shell',()=>{
    expect(sw).toContain("const CACHE = 'pendientes-shell-20260819-85'");
    expect(sw).toContain("'/turno-rx/interaction-runtime-v85.js?v=85'");
    expect(sw).not.toMatch(/^\s*'\/turno-rx\/interaction-runtime-v84\.js\?v=84',?\s*$/m);
    expect(sw).not.toMatch(/^\s*'\/turno-rx\/stability\.js\?v=20260818\.1',?\s*$/m);
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain("cache:'no-store'");
  });
});
