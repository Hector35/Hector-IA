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

describe('Pendientes v87 operational hardening',()=>{
  it('loads hardening after the legacy renderer and before the modern capture owner',()=>{
    const modules=activeModuleSources(index);
    const coreIndex=modules.indexOf('/turno-rx/app-v16.js?v=87');
    const hardeningIndex=modules.indexOf('/turno-rx/runtime-hardening-v86.js?v=87');
    const captureIndex=modules.indexOf('/turno-rx/capture-fix-v80.js?v=87');
    expect(coreIndex).toBeGreaterThanOrEqual(0);
    expect(hardeningIndex).toBeGreaterThan(coreIndex);
    expect(captureIndex).toBeGreaterThan(hardeningIndex);
    expect(modules).toContain('/turno-rx/patient-detail-history-v82.js?v=87');
    expect(modules).toContain('/turno-rx/interaction-runtime-v85.js?v=87');
    expect(modules).not.toContain('/turno-rx/stability.js?v=20260818.1');
  });

  it('declares one gallery owner without replacing live DOM nodes',()=>{
    expect(core).toContain('handlePhotoInput');
    expect(core).not.toContain("addEventListener('change',handlePhotoInput)");
    expect(core).toContain("data-capture-owner','modern-v87'");
    expect(hardening).toContain("document.getElementById('galleryInput')");
    expect(hardening).not.toContain('cloneNode(true)');
    expect(hardening).not.toContain('input.replaceWith');
    expect(hardening).not.toContain('new MutationObserver');
    expect(hardening).toContain("input.dataset.captureOwner='modern-v87'");
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
    expect(interactions).toContain("const seq=['Por definir','Silla','Camilla','No trasladar']");
    expect(interactions).not.toContain("if(current==='No trasladar')return");
    expect(interactions).not.toContain("write(STORAGE_KEY,[]);localStorage.setItem(ACTIVE_TAB_KEY,'RX');location.reload()");
  });

  it('keeps manual transport overrides consistent',()=>{
    expect(interactions).toContain("transportReason:''");
    expect(interactions).toContain('transportReasonAuto:automaticReason');
    expect(interactions).toContain('transport:true,transportReason:true');
  });

  it('queues new photo selections while analysis is already running',()=>{
    expect(capture).toContain('const pendingFiles=[]');
    expect(capture).toContain('pendingFiles.push(...arr)');
    expect(capture).toContain('batch.total+=arr.length');
    expect(capture).toContain('while(pendingFiles.length)');
    expect(capture).not.toContain('if(processing)return;const arr=');
  });

  it('removes old unconfirmed Piso OCR placeholders instead of counting them as patients',()=>{
    expect(hardening).toContain("if(row?.captureReviewOnly&&!clean(row?.bed))");
    expect(capture).toContain('review++');
    expect(capture).not.toContain('list.unshift(partial)');
  });

  it('recovers explicit Piso origins and services from OCR row text',()=>{
    expect(capture).toContain('function floorBedFromText(value)');
    expect(capture).toContain('C(?:AMA)?\\s*#\\s*0*(\\d{1,3})');
    expect(capture).toContain('(CE|UP|UI|UA)\\s*#?\\s*0*(\\d{1,3})');
    expect(capture).toContain('function floorServiceFromText(value)');
    expect(capture).toContain("return'Nefrología'");
    expect(capture).toContain("return'Geriatría'");
    expect(capture).toContain("return'Medicina Interna'");
    expect(capture).toContain("category==='Piso'?floorBedFromText(recognizedText):''");
  });

  it('keeps the service worker coherent with the v87 shell',()=>{
    expect(sw).toContain("const CACHE = 'pendientes-shell-20260820-87'");
    expect(sw).toContain("'/turno-rx/runtime-hardening-v86.js?v=87'");
    expect(sw).toContain("'/turno-rx/interaction-runtime-v85.js?v=87'");
    expect(sw).not.toMatch(/^\s*'\/turno-rx\/stability\.js\?v=20260818\.1',?\s*$/m);
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain("cache:'no-store'");
  });
});
