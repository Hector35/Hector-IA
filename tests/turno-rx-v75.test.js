import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const controller=read('public/turno-rx/capture-detail-v75.js');
const guard=read('public/turno-rx/capture-fix-v77.js');
const index=read('public/turno-rx/index.html');
const sw=read('public/turno-rx/sw.js');
const css=read('public/turno-rx/capture-detail-v75.css');

describe('Pendientes v75/v77 capture/detail contract',()=>{
  it('loads v77 before v75 and both before the legacy stability capture controller',()=>{
    const v77=index.indexOf('capture-fix-v77.js?v=77');
    const v75=index.indexOf('capture-detail-v75.js?v=75');
    const stability=index.indexOf('stability.js?v=20260818.1');
    expect(v77).toBeGreaterThan(-1);
    expect(v75).toBeGreaterThan(v77);
    expect(stability).toBeGreaterThan(v75);
    expect(index).toContain('capture-detail-v75.css?v=75');
  });

  it('preserves rich boleta metadata and original image reference',()=>{
    for(const field of ['requestingDoctor','folio','requestDate','requestTime','transferNotes','extraData','recognizedText','boletaImageFingerprint']) expect(guard).toContain(field);
    expect(guard).toContain('indexedDB.open(DB_NAME,1)');
    expect(controller).toContain('Foto original de la boleta');
  });

  it('uses floor origin/destination semantics instead of copying service to origin',()=>{
    expect(guard).toContain('destinationService');
    expect(guard).toContain('originService solo si la procedencia está explícita');
    expect(guard).toContain("if(/nefrolog/.test(s))return{destinationFloor:'Primero',destinationBlock:'B'}");
    expect(guard).toContain("if(/medicina interna|\\bmi\\b/.test(s))return{destinationFloor:'Tercero',destinationBlock:'B'}");
  });

  it('keeps partial Piso rows visible for review and never fabricates the board total',()=>{
    expect(guard).toContain('captureReviewOnly:partial');
    expect(guard).toContain('partials++');
    expect(guard).toContain('floorBoardTotal');
    expect(guard).toContain('Nunca inventes camas para alcanzar el total');
    expect(guard).toContain('Revisando renglones de Piso');
  });

  it('keeps transport inference evidence-gated and image limits coherent',()=>{
    expect(guard).toContain("return['Por definir','']");
    expect(guard).toContain('explicitCamilla');
    expect(guard).toContain('explicitSilla');
    expect(guard).toContain('MAX_IMAGE_BYTES=8*1024*1024');
    expect(guard).not.toContain('12*1024*1024');
  });

  it('reports local image persistence failure instead of swallowing it silently',()=>{
    expect(guard).toContain("console.warn('[Pendientes v77] No se pudo guardar foto de boleta'");
    expect(guard).toContain('boletaImageAvailable:imageAvailable');
    expect(guard).toContain('la foto no pudo guardarse en este iPhone');
  });

  it('updates service worker shell coherently',()=>{
    expect(sw).toContain('pendientes-shell-20260819-77');
    expect(sw).toContain('/turno-rx/capture-fix-v77.js?v=77');
    expect(sw).toContain('/turno-rx/capture-detail-v75.js?v=75');
    expect(sw).toContain('/turno-rx/capture-detail-v75.css?v=75');
  });

  it('includes visible v75 detail and interface styling',()=>{
    expect(css).toContain('.v75-photo');
    expect(css).toContain('.v75-fields');
    expect(css).toContain('html[data-pendientes-build="75"] .category-tab.is-active');
  });
});
