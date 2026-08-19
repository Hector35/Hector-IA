import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const index=readFileSync(new URL('../public/turno-rx/index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/turno-rx/sw.js',import.meta.url),'utf8');
const core=readFileSync(new URL('../public/turno-rx/app-v16.js',import.meta.url),'utf8');
const hardening=readFileSync(new URL('../public/turno-rx/runtime-hardening-v86.js',import.meta.url),'utf8');
const capture=readFileSync(new URL('../public/turno-rx/capture-fix-v80.js',import.meta.url),'utf8');
const interactions=readFileSync(new URL('../public/turno-rx/interaction-runtime-v85.js',import.meta.url),'utf8');
const detail=readFileSync(new URL('../public/turno-rx/patient-detail-history-v82.js',import.meta.url),'utf8');

function activeModuleSources(html){return [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map(m=>m[1]);}

describe('Pendientes v86 runtime hardening',()=>{
  it('loads hardening after the legacy renderer and before the modern capture owner',()=>{
    const modules=activeModuleSources(index);
    const coreIndex=modules.indexOf('/turno-rx/app-v16.js?v=65');
    const hardeningIndex=modules.indexOf('/turno-rx/runtime-hardening-v86.js?v=86');
    const captureIndex=modules.indexOf('/turno-rx/capture-fix-v80.js?v=81');
    expect(coreIndex).toBeGreaterThanOrEqual(0);
    expect(hardeningIndex).toBeGreaterThan(coreIndex);
    expect(captureIndex).toBeGreaterThan(hardeningIndex);
    expect(modules).toContain('/turno-rx/patient-detail-history-v82.js?v=83');
    expect(modules).toContain('/turno-rx/interaction-runtime-v85.js?v=85');
    expect(modules).not.toContain('/turno-rx/stability.js?v=20260818.1');
  });

  it('neutralizes app-v16 direct gallery ownership without adding another vision engine',()=>{
    expect(core).toContain('handlePhotoInput');
    expect(hardening).toContain("document.getElementById('galleryInput')");
    expect(hardening).toContain('cloneNode(true)');
    expect(hardening).toContain('input.replaceWith(clone)');
    expect(hardening).toContain("clone.dataset.captureOwner='modern-v86'");
    expect(capture).toContain("fetch('/api/turno-rx/vision'");
    expect(hardening).not.toContain("fetch('/api/turno-rx/vision'");
    expect(hardening).not.toContain('VISION_PROMPT');
    expect(interactions).not.toContain("fetch('/api/turno-rx/vision'");
    expect(interactions).not.toContain('VISION_PROMPT');
    expect(detail).not.toContain("fetch('/api/turno-rx/vision'");
    expect(detail).not.toContain('VISION_PROMPT');
  });

  it('migrates legacy Piso destination services without destructive field projection',()=>{
    expect(hardening).toContain('function migrateLegacyFloorRow');
    expect(hardening).toContain('next.destinationService=candidate');
    expect(hardening).toContain("next.originService=''");
    expect(hardening).toContain('next.schemaVersion=Math.max');
    expect(hardening).toContain("['nefrologia',{floor:'Primero',block:'B'}]");
    expect(hardening).toContain("['medicina interna',{floor:'Tercero',block:'B'}]");
    expect(hardening).toContain("['ginecologia',{floor:'Quinto',block:'A'}]");
    expect(hardening).toContain('const next={...row}');
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

  it('keeps manual transport overrides consistent',()=>{
    expect(interactions).toContain("transportReason:''");
    expect(interactions).toContain('transportReasonAuto:automaticReason');
    expect(interactions).toContain('transport:true,transportReason:true');
  });

  it('keeps the service worker coherent with the v86 shell',()=>{
    expect(sw).toContain("const CACHE = 'pendientes-shell-20260819-86'");
    expect(sw).toContain("'/turno-rx/runtime-hardening-v86.js?v=86'");
    expect(sw).toContain("'/turno-rx/interaction-runtime-v85.js?v=85'");
    expect(sw).not.toMatch(/^\s*'\/turno-rx\/stability\.js\?v=20260818\.1',?\s*$/m);
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain("cache:'no-store'");
  });
});
