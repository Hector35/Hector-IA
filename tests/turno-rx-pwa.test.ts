import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {
  canonicalOrigin,
  compareOrigins,
  displayOrigin,
  findConflictsAgainstExisting,
  findDuplicateFloorOrigins,
  findMatchingRowIndex,
  floorGroupKey,
  isCompleteFloorRow,
  isIncompleteFloorRow,
  normalizeModality,
  normalizeStudyDisplay,
  compareImagingRows,
  effectiveTransport,
} from '../public/turno-rx/app-v16.js';

const read=(path:string)=>readFileSync(path,'utf8');
const app=read('public/turno-rx/app-v16.js');
const index=read('public/turno-rx/index.html');
const sw=read('public/turno-rx/sw.js');
const manifest=JSON.parse(read('public/turno-rx/manifest.webmanifest'));

describe('Pendientes PWA v16',()=>{
  it('mantiene una PWA instalable con alcance propio y carga v16',()=>{
    expect(manifest.start_url).toBe('/turno-rx/');
    expect(manifest.scope).toBe('/turno-rx/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.short_name).toBe('Pendientes');
    expect(index).toContain('/turno-rx/app-v16.js?v=2');
    expect(index).toContain('/turno-rx/integrity-v16.css?v=2');
    expect(index).toContain('/turno-rx/name-format-v23.js?v=1');
    expect(index).toContain('/turno-rx/one-line-v24.css?v=1');
    expect(index).toContain('/turno-rx/space-v25.css?v=1');
    expect(index).toContain('/turno-rx/adaptive-row-v26.css?v=1');
    expect(index).toContain('/turno-rx/font-v27.css?v=1');
    expect(index).toContain('/turno-rx/adaptive-row-v26.js?v=1');
  });

  it('mapea exactamente los límites de camas a sus pisos',()=>{
    expect(floorGroupKey('1')).toBe('primero');
    expect(floorGroupKey('44')).toBe('primero');
    expect(floorGroupKey('45')).toBe('segundo');
    expect(floorGroupKey('88')).toBe('segundo');
    expect(floorGroupKey('89')).toBe('tercero');
    expect(floorGroupKey('132')).toBe('tercero');
    expect(floorGroupKey('133')).toBe('segundo-otra');
    expect(floorGroupKey('165')).toBe('segundo-otra');
    expect(floorGroupKey('166')).toBe('tercero-otra');
    expect(floorGroupKey('189')).toBe('tercero-otra');
    expect(floorGroupKey('190')).toBe('quinto-otra');
    expect(floorGroupKey('204')).toBe('quinto-otra');
    expect(floorGroupKey('205')).toBe('por-ubicar');
    expect(floorGroupKey('UEH')).toBe('ueh');
  });

  it('normaliza camas sin romper CE/UP/UI y corrige C/ CE4',()=>{
    expect(canonicalOrigin('15')).toBe('N:15');
    expect(canonicalOrigin('UA15')).toBe('N:15');
    expect(canonicalOrigin('C#15')).toBe('N:15');
    expect(displayOrigin('UA015')).toBe('15');
    expect(canonicalOrigin('CE1')).toBe('CE:1');
    expect(canonicalOrigin('UP2')).toBe('UP:2');
    expect(canonicalOrigin('UI1')).toBe('UI:1');
    expect(displayOrigin('C/ CE4')).toBe('CE4');
  });

  it('detecta duplicados dentro de la misma lectura incluso con prefijos distintos',()=>{
    const duplicateRows=[{bed:'UA15',target:'72'},{bed:'15',target:'110'},{bed:'CE1',target:'30'}];
    expect(findDuplicateFloorOrigins(duplicateRows)).toEqual(['15']);
  });

  it('detecta duplicados contra pacientes ya cargados en el turno',()=>{
    const existing=[{id:'a',bed:'C#15',target:'72'}];
    const incoming=[{id:'b',bed:'UA15',target:'110'}];
    expect(findConflictsAgainstExisting(existing,incoming)).toEqual(['15']);
  });

  it('no mezcla dos pacientes solo porque tengan el mismo nombre',()=>{
    const existing=[{id:'a',bed:'10',name:'JUAN PEREZ',target:'TAC'}];
    const incoming={id:'b',bed:'11',name:'JUAN PEREZ',target:'TAC'};
    expect(findMatchingRowIndex(existing,incoming)).toBe(-1);
  });

  it('solo cuenta a piso cuando hay Origen + Destino',()=>{
    expect(isCompleteFloorRow({bed:'15',target:'110'})).toBe(true);
    expect(isIncompleteFloorRow({bed:'',target:'110'})).toBe(true);
    expect(isCompleteFloorRow({bed:'',target:'110'})).toBe(false);
    expect(isIncompleteFloorRow({bed:'15',target:'TAC tórax'})).toBe(false);
  });

  it('ordena primero camas numéricas y luego ubicaciones especiales',()=>{
    const rows=[{bed:'CE2'},{bed:'14'},{bed:'2'},{bed:'CE1'},{bed:'8'}];
    rows.sort(compareOrigins);
    expect(rows.map((row)=>displayOrigin(row.bed))).toEqual(['2','8','14','CE1','CE2']);
  });

  it('separa modalidades y normaliza el estudio para el flujo operativo',()=>{
    expect(normalizeModality('', 'TAC de rodilla')).toBe('TAC');
    expect(normalizeModality('', 'USG hepático')).toBe('Ultrasonido');
    expect(normalizeModality('', 'Tele de tórax + pelvis AP')).toBe('Rayos X');
    expect(normalizeStudyDisplay('Abdomen simple + tele de tórax')).toBe('Tórax + Abdomen');
    expect(normalizeStudyDisplay('abdomen/protocolo + pelvis')).toBe('abdomen + pelvis');
  });

  it('ordena sillas antes que camillas y reconoce portátil como no trasladar',()=>{
    const silla={bed:'CE4',sex:'Hombre',age:70,target:'Tórax',transport:'Silla'};
    const camilla={bed:'CE2',sex:'Mujer',age:20,target:'Tórax',transport:'Camilla'};
    expect(compareImagingRows(silla,camilla)).toBeLessThan(0);
    expect(effectiveTransport({target:'Tórax PORTÁTIL',transport:'Camilla'})).toBe('No trasladar');
  });

  it('conserva foto/manual, revisión por turno, diagnóstico y deshacer',()=>{
    expect(app).toContain('id="galleryCapture"');
    expect(app).toContain('id="manualCapture"');
    expect(app).toContain('id="newShift"');
    expect(app).toContain('SHIFT_MAX_AGE_MS');
    expect(app).toContain('archiveShift');
    expect(app).toContain('id="undoRemove"');
    expect(app).toContain('id="diagnosis"');
    expect(app).toContain('id="diagnosisMeaning"');
    expect(app).toContain('Diagnóstico');
    expect(app).toContain('Qué significa');
    expect(app).toContain('No cuentan en el total hasta tener Origen + Destino.');
    expect(app).not.toContain('id="cameraCapture"');
  });

  it('mantiene la ruta de visión solicitada y no cachea APIs clínicas',()=>{
    expect(app).toContain("fetch('/api/turno-rx/vision'");
    expect(app).toContain("'X-Turno-RX':'1'");
    expect(app).not.toMatch(/sk-[A-Za-z0-9_-]+/);
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain("turno-rx-shell-v27");
    expect(sw).toContain('/turno-rx/app-v16.js?v=2');
    expect(sw).toContain('/turno-rx/transport-v20.js?v=2');
    expect(sw).toContain('/turno-rx/name-format-v23.js?v=1');
    expect(sw).toContain('/turno-rx/one-line-v24.css?v=1');
    expect(sw).toContain('/turno-rx/space-v25.css?v=1');
    expect(sw).toContain('/turno-rx/adaptive-row-v26.css?v=1');
    expect(sw).toContain('/turno-rx/font-v27.css?v=1');
    expect(sw).toContain('/turno-rx/adaptive-row-v26.js?v=1');
  });
});
