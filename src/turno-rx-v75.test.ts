import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const controller=read('public/turno-rx/capture-detail-v75.js');
const index=read('public/turno-rx/index.html');
const sw=read('public/turno-rx/sw.js');
const css=read('public/turno-rx/capture-detail-v75.css');

describe('Pendientes v75 capture/detail contract',()=>{
  it('loads v75 before the legacy stability capture controller',()=>{
    const v75=index.indexOf('capture-detail-v75.js?v=75');
    const stability=index.indexOf('stability.js?v=20260818.1');
    expect(v75).toBeGreaterThan(-1);
    expect(stability).toBeGreaterThan(v75);
    expect(index).toContain('capture-detail-v75.css?v=75');
  });

  it('preserves rich boleta metadata and original image reference',()=>{
    for(const field of ['requestingDoctor','folio','requestDate','requestTime','transferNotes','extraData','recognizedText','boletaImageFingerprint']){
      expect(controller).toContain(field);
    }
    expect(controller).toContain("indexedDB.open(DB_NAME,1)");
    expect(controller).toContain("Foto original de la boleta");
  });

  it('uses floor origin/destination semantics instead of copying service to origin',()=>{
    expect(controller).toContain('destinationService');
    expect(controller).toContain('originService solo se usa si la procedencia está explícita');
    expect(controller).toContain("if(/nefrolog/.test(s))return{destinationFloor:'Primero',destinationBlock:'B'}");
    expect(controller).toContain("if(/medicina interna|\\bmi\\b/.test(s))return{destinationFloor:'Tercero',destinationBlock:'B'}");
  });

  it('keeps transport inference conservative and client/backend image limits coherent',()=>{
    expect(controller).toContain("return['Por definir',clean(p?.transportReason)]");
    expect(controller).toContain("file.size>8*1024*1024");
    expect(controller).not.toContain('file.size>12*1024*1024');
  });

  it('updates the service worker shell coherently',()=>{
    expect(sw).toContain("pendientes-shell-20260819-75");
    expect(sw).toContain("/turno-rx/capture-detail-v75.js?v=75");
    expect(sw).toContain("/turno-rx/capture-detail-v75.css?v=75");
  });

  it('includes visible v75 detail and interface styling',()=>{
    expect(css).toContain('.v75-photo');
    expect(css).toContain('.v75-fields');
    expect(css).toContain('html[data-pendientes-build="75"] .category-tab.is-active');
  });
});
