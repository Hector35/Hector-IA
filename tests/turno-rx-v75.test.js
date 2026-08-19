import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const controller=read('public/turno-rx/capture-detail-v75.js');
const guard=read('public/turno-rx/capture-fix-v79.js');
const index=read('public/turno-rx/index.html');
const sw=read('public/turno-rx/sw.js');
const css=read('public/turno-rx/capture-detail-v75.css');

describe('Pendientes v75/v79 capture/detail contract',()=>{
  it('loads v79 capture before v75 detail and both before the legacy stability capture controller',()=>{
    const v79=index.indexOf('capture-fix-v79.js?v=79');
    const v75=index.indexOf('capture-detail-v75.js?v=75');
    const stability=index.indexOf('stability.js?v=20260818.1');
    expect(v79).toBeGreaterThan(-1);
    expect(v75).toBeGreaterThan(v79);
    expect(stability).toBeGreaterThan(v75);
    expect(index).not.toContain('capture-fix-v77.js?v=78');
    expect(index).toContain('capture-detail-v75.css?v=78');
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
  });

  it('rescans Piso based on confirmed beds rather than partial text rows',()=>{
    expect(guard).toContain('function floorRecognitionStats(patients)');
    expect(guard).toContain('confirmedBeds++');
    expect(guard).toContain('partialRows++');
    expect(guard).toContain('confirmedBeds<boardTotal');
    expect(guard).not.toContain('floorRecognizedCount');
    expect(guard).not.toContain('recognized<boardTotal');
    expect(guard).toContain('Revisando renglones de Piso');
  });

  it('can rescan a clearly identified Piso board even when the total is missing',()=>{
    expect(guard).toContain('documentType');
    expect(guard).toContain("plain(first?.documentType)==='piso'");
    expect(guard).toContain('looksLikeFloorBoard(first,patients)');
  });

  it('requires visible evidence for Silla Camilla and No trasladar',()=>{
    expect(guard).toContain("return['Por definir','']");
    expect(guard).toContain('explicitCamilla');
    expect(guard).toContain('explicitSilla');
    expect(guard).toContain('explicitNoMove');
    expect(guard).toContain('portable');
    expect(guard).not.toContain("requested.includes('no traslad')");
    expect(guard).toContain('MAX_IMAGE_BYTES=8*1024*1024');
    expect(guard).not.toContain('12*1024*1024');
  });

  it('keeps image availability tied to the active fingerprint',()=>{
    expect(guard).toContain('imageChanged?incoming.boletaImageAvailable!==false');
    expect(guard).toContain('boletaImageFingerprint:incomingFp||existingFp');
    expect(guard).not.toContain('incoming.boletaImageAvailable!==false&&existing.boletaImageAvailable!==false');
  });

  it('reports persistence failure and cleans orphan images on both errors and zero-result success',()=>{
    expect(guard).toContain("console.warn('[Pendientes v79] No se pudo guardar foto de boleta'");
    expect(guard).toContain('async function deleteImage(fp)');
    expect(guard).toContain('result.added===0&&result.updated===0&&result.partials===0');
    expect(guard).toContain('!referencesImage(fp)');
    expect(guard).toContain('await deleteImage(fp)');
  });

  it('keeps interface styling independent from the current runtime build number',()=>{
    expect(css).toContain('html[data-pendientes-build] .category-tab.is-active');
    expect(css).not.toContain('html[data-pendientes-build="75"] .category-tab.is-active');
  });

  it('updates service worker shell coherently',()=>{
    expect(sw).toContain('pendientes-shell-20260819-79');
    expect(sw).toContain('/turno-rx/capture-fix-v79.js?v=79');
    expect(sw).not.toContain('/turno-rx/capture-fix-v77.js?v=78');
    expect(sw).toContain('/turno-rx/capture-detail-v75.js?v=75');
    expect(sw).toContain('/turno-rx/capture-detail-v75.css?v=78');
  });
});
