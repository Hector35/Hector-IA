import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const detail=read('public/turno-rx/patient-detail-history-v82.js');
const legacyDetail=read('public/turno-rx/capture-detail-v75.js');
const legacyStability=read('public/turno-rx/stability.js');
const interactions=read('public/turno-rx/interaction-runtime-v85.js');
const guard=read('public/turno-rx/capture-fix-v80.js');
const index=read('public/turno-rx/index.html');
const sw=read('public/turno-rx/sw.js');
const css=read('public/turno-rx/capture-detail-v75.css');

describe('Pendientes v89 operational contract',()=>{
  it('loads one capture owner, detail/history, and interaction runtime in order',()=>{
    const captureIndex=index.indexOf('capture-fix-v80.js?v=87');
    const detailIndex=index.indexOf('patient-detail-history-v82.js?v=89');
    const interactionIndex=index.indexOf('interaction-runtime-v85.js?v=89');
    expect(captureIndex).toBeGreaterThan(-1);
    expect(detailIndex).toBeGreaterThan(captureIndex);
    expect(interactionIndex).toBeGreaterThan(detailIndex);
    const activeScripts=index.match(/<script[^>]+src="[^"]+"[^>]*><\/script>/g)||[];
    expect(activeScripts.some(tag=>tag.includes('capture-detail-v75.js'))).toBe(false);
    expect(activeScripts.some(tag=>tag.includes('/turno-rx/stability.js'))).toBe(false);
    expect(index).toContain('capture-detail-v75.js?v=75');
    expect(index).toContain('stability.js?v=20260818.1');
    expect(index).toContain('capture-detail-v75.css?v=78');
  });

  it('keeps detail/history module capture-free and accessible',()=>{
    expect(detail).not.toContain('VISION_PROMPT');
    expect(detail).not.toContain("addEventListener('change'");
    expect(detail).not.toContain('/api/turno-rx/vision');
    expect(detail).toContain("const BUILD='89'");
    expect(detail).toContain('role="dialog" aria-modal="true"');
    expect(detail).toContain("e.key!=='Escape'");
    expect(detail).toContain('HISTORIAL · BOLETA');
    expect(detail).toContain('Foto original de la boleta');
    expect(detail).toContain('pendientes-shift-history-v1');
    expect(detail).toContain("createObjectStore(STORE,{keyPath:'fp'})");
  });

  it('keeps interaction runtime capture-free while preserving gestures and drawer',()=>{
    expect(interactions).not.toContain('VISION_PROMPT');
    expect(interactions).not.toContain("fetch('/api/turno-rx/vision'");
    expect(interactions).not.toContain("addEventListener('change'");
    expect(interactions).not.toContain('12*1024*1024');
    expect(interactions).toContain("addEventListener('pointerdown'");
    expect(interactions).toContain("addEventListener('pointermove'");
    expect(interactions).toContain("addEventListener('pointerup'");
    expect(interactions).toContain("setStatus(g.id,'Realizado')");
    expect(interactions).toContain("setStatus(g.id,'Pendiente')");
    expect(interactions).toContain('transportCycle');
    expect(interactions).toContain('openSideMenu');
    expect(interactions).toContain('closeSideMenu');
    expect(interactions).toContain("document.getElementById('cameraInput')?.click()");
  });

  it('keeps legacy capture sources inert rather than deleting historical source',()=>{
    expect(legacyDetail).toContain('VISION_PROMPT');
    expect(legacyStability).toContain('VISION_PROMPT');
    expect(index).not.toContain('<script type="module" src="/turno-rx/capture-detail-v75.js?v=75"></script>');
    expect(index).not.toContain('<script type="module" src="/turno-rx/stability.js?v=20260818.1"></script>');
  });

  it('preserves rich boleta metadata and original image reference',()=>{
    for(const field of ['requestingDoctor','folio','requestDate','requestTime','transferNotes','extraData','recognizedText','boletaImageFingerprint']) expect(guard).toContain(field);
    expect(guard).toContain('indexedDB.open(DB_NAME,1)');
    expect(detail).toContain('Foto original de la boleta');
  });

  it('opens archived records with the same rich detail fields and stored image fingerprint',()=>{
    for(const label of ['Médico','Folio','Fecha solicitud','Hora solicitud','Diagnóstico','Notas','Traslado']) expect(detail).toContain(label);
    expect(detail).toContain('boletaImageFingerprint||r.imageFingerprint');
    expect(detail).toContain('data-v82-history-row');
    expect(detail).toContain('openDetail(record,{historical:true})');
  });

  it('renders history lazily one shift at a time',()=>{
    expect(detail).toContain('function renderShiftList(back,history)');
    expect(detail).toContain('function renderShiftRows(back,history,hi)');
    expect(detail).toContain('data-v83-history-shift');
    expect(detail).toContain('data-v83-history-back');
    expect(detail).toContain('renderShiftList(back,history)');
    expect(detail).not.toContain('history.map((h,hi)=>{const when=');
  });

  it('uses floor origin/destination semantics instead of copying destination service to origin',()=>{
    expect(guard).toContain('destinationService');
    expect(guard).toContain('originService solo si la procedencia está explícita');
    expect(guard).toContain("if(/nefrolog/.test(s))return{destinationFloor:'Primero',destinationBlock:'B'}");
    expect(guard).toContain("if(/medicina interna|\\bmi\\b/.test(s))return{destinationFloor:'Tercero',destinationBlock:'B'}");
  });

  it('does not persist partial Piso rows and never fabricates the board total',()=>{
    expect(guard).toContain('review++');
    expect(guard).not.toContain('list.unshift(partial)');
    expect(guard).toContain('floorBoardTotal');
    expect(guard).toContain('Nunca inventes camas para alcanzar el total');
  });

  it('counts unique Piso beds for rescan instead of repeated model rows',()=>{
    expect(guard).toContain('const uniqueBeds=new Set()');
    expect(guard).toContain('uniqueBeds.add(canonicalOrigin(bed))');
    expect(guard).toContain('confirmedBeds:uniqueBeds.size');
    expect(guard).not.toContain('if(bed)confirmedBeds++');
    expect(guard).toContain('confirmedBeds<boardTotal');
    expect(guard).toContain('camas únicas');
  });

  it('does not deduplicate imaging patients from different beds even when study and name are equal or missing',()=>{
    expect(guard).toContain('function imagingDedupeKey(p,index)');
    expect(guard).toContain('if(origin)return`${category}:bed:${origin}:name:${name}:target:${target}`');
    expect(guard).toContain('return`${category}:row:${index}:target:${target}`');
    expect(guard).toContain('Dos camas distintas con el mismo estudio son pacientes distintos');
  });

  it('requires strong visible identity before reconciling different photos from the same bed and study',()=>{
    expect(guard).toContain('function sameImagingIdentity(a,b)');
    expect(guard).toContain('if(aFolio&&bFolio)return aFolio===bFolio');
    expect(guard).toContain('if(aName&&bName)return sameName(aName,bName)');
    expect(guard).toContain('if(aDate&&bDate&&aTime&&bTime)return aDate===bDate&&aTime===bTime');
    expect(guard).toContain('aText.length>=20&&bText.length>=20&&aText===bText');
    expect(guard).toContain('if(aBed&&bBed&&aBed!==bBed)return false');
    expect(guard).toContain('return sameImagingIdentity(a,b)&&Boolean(aTarget||bTarget||aBed||bBed)');
    expect(guard).not.toContain('aBed===bBed&&namesCompatible');
    expect(guard).toContain('Dos solicitudes distintas de la misma cama y mismo estudio NO se fusionan');
  });

  it('does not use Realizado as a semantic reconciliation blocker',()=>{
    expect(guard).toContain("plain(r.status)!=='realizado'");
    expect(guard).toContain('sameImagingRequest(r,incoming)');
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
    expect(guard).toContain("console.warn('[Pendientes v80] No se pudo guardar foto de boleta'");
    expect(guard).toContain('async function deleteImage(fp)');
    expect(guard).toContain('result.added===0&&result.updated===0');
    expect(guard).toContain('!referencesImage(fp)');
    expect(guard).toContain('await deleteImage(fp)');
  });

  it('keeps interface styling independent from the current runtime build number',()=>{
    expect(css).toContain('html[data-pendientes-build] .category-tab.is-active');
    expect(css).not.toContain('html[data-pendientes-build="75"] .category-tab.is-active');
  });

  it('updates service worker shell coherently',()=>{
    expect(sw).toContain('pendientes-shell-20260822-89');
    expect(sw).toContain('/turno-rx/capture-fix-v80.js?v=87');
    expect(sw).toContain('/turno-rx/runtime-preflight-v89.js?v=89');
    expect(sw).toContain('/turno-rx/patient-detail-history-v82.js?v=89');
    expect(sw).toContain('/turno-rx/interaction-runtime-v85.js?v=89');
    expect(sw).toContain('/turno-rx/runtime-v89.css?v=89');
    expect(sw).not.toContain("'/turno-rx/capture-detail-v75.js?v=75'");
    expect(sw).not.toContain("'/turno-rx/stability.js?v=20260818.1'");
    expect(sw).toContain('/turno-rx/capture-detail-v75.css?v=78');
  });
});
