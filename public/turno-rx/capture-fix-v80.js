import { syncRowsFromStorageAndRender, canonicalOrigin, normalizeAge, normalizeStudyDisplay } from './app-v16.js?v=87';

const STORAGE_KEY='pendientes-table-v2';
const SHIFT_KEY='pendientes-shift-v1';
const BUILD='87';
const DB_NAME='pendientes-boleta-images-v1';
const STORE='images';
const MAX_IMAGE_BYTES=8*1024*1024;

const VISION_PROMPT=`Analiza esta foto de una boleta, solicitud o pizarrón hospitalario para la PWA Pendientes. Devuelve SOLO JSON válido, sin markdown, con este formato:
{"documentType":"Piso|Boleta|Otro","floorBoardTotal":null,"patients":[{"category":"Rayos X|TAC|USG|Piso|Interconsulta|Apoyo para movimiento","handwrittenBed":"","formBed":"","bed":"","name":"","birthDate":null,"age":null,"sex":"Mujer|Hombre|No visible","target":"","destination":"","destinationFloor":"","destinationBlock":"","destinationService":"","modality":"Rayos X|TAC|Ultrasonido|Otro","region":"","withContrast":false,"diagnosis":"","diagnosisMeaning":"","requestingDoctor":"","folio":"","service":"","originService":"","requestDate":"","requestTime":"","transferNotes":"","extraData":{},"recognizedText":"","confidence":{"bed":"high|medium|low","name":"high|medium|low","age":"high|medium|low","sex":"high|medium|low","target":"high|medium|low"},"transport":"Silla|Camilla|No trasladar|Por definir","transportReason":"","oxygenProbable":false,"oxygenReason":""}]}.

REGLAS GENERALES:
- documentType="Piso" cuando la imagen sea claramente un pizarrón/lista de pacientes que subirán a Piso; "Boleta" para una solicitud individual; "Otro" si no se puede asegurar.
- Extrae únicamente lo visible. No inventes nombres, camas, destinos, diagnósticos, servicios ni hechos clínicos.
- Conserva TODO dato legible. Lo que no tenga campo propio va en extraData con una clave descriptiva.
- recognizedText conserva una transcripción útil del renglón o boleta.
- Sala de espera nunca sustituye una cama manuscrita visible.
- CE1, CE2, CE3, CE4, UP, UP1, UI1 y similares son áreas; nunca las conviertas en cama 1. "C/ CE4" significa CE4.
- Si un campo es dudoso usa confidence low y no lo completes por contexto.

PISO / PIZARRÓN:
- Si existe un encabezado como "PISO = 11", floorBoardTotal=11. Ese número sirve SOLO como control de calidad; nunca crea pacientes ni autoriza inventarlos.
- Lee cada renglón físico por separado, de arriba hacia abajo y en ambas columnas si existen.
- En renglones como "C#11 NEFRO", "C#1 GASTRO" o "CE1 GERIA", C#11, C#1 y CE1 son la cama/área de origen y deben ir en bed; el texto restante es destinationService. No pierdas el número por el símbolo #.
- Un paciente de Piso confirmado requiere cama/área real de origen. Si un renglón se ve pero la cama no es legible, devuelve UN objeto parcial category="Piso", bed vacío, recognizedText con lo visible y confidence.bed="low".
- En pizarrones con columnas H y M, H=Hombre y M=Mujer según la columna física donde está el renglón.
- bed es la cama/área actual. destination es la cama destino visible si existe.
- Un servicio junto a "sube a", "va a", "ingresa a", "pasa a" o equivalente es destinationService, no originService.
- originService solo si la procedencia está explícita. No copies service automáticamente a originService.
- Nefrología=>Primero B; Cirugía/Trauma=>Segundo B; Medicina Interna=>Tercero B; Obstetricia=>Segundo A; Pediatría=>Tercero A; Ginecología=>Quinto A. Guarda el servicio visible en destinationService; no inventes cama destino.
- No repitas renglones para alcanzar floorBoardTotal. Si faltan renglones legibles, devuelve los reales y parciales solamente.

IMAGENOLOGÍA:
- TAC/TC/tomografía/AngioTAC => TAC. USG/ultrasonido/ecografía => USG. RX/radiografía/placa/tele => Rayos X.
- requestingDoctor, folio, requestDate, requestTime, service, originService, transferNotes, diagnóstico y cualquier otro dato visible deben conservarse.
- Si una boleta solicita modalidades distintas, devuelve un objeto por modalidad compartiendo la metadata visible.
- Dos camas distintas con el mismo estudio son pacientes distintos aunque el nombre no sea legible.
- Dos solicitudes distintas de la misma cama y mismo estudio NO se fusionan entre fotografías sin una identidad visible fuerte (folio, nombre compatible, fecha+hora o texto de boleta inequívocamente igual).

TRASLADO:
- Es una estimación operativa conservadora, no una orden médica.
- No trasladar SOLO cuando el texto visible diga PORTÁTIL, "no trasladar" o equivalente inequívoco.
- Camilla SOLO con evidencia visible explícita o de imposibilidad/alto riesgo para traslado sentado: inmovilidad/no deambula/encamado, fractura o trauma importante con limitación, déficit neurológico motor marcado/hemiplejia, estado general delicado con indicación de ir acostado.
- Silla SOLO si aparece indicación explícita de silla o evidencia explícita de que puede ir sentado/deambular con apoyo.
- Edad, sexo, nombre del estudio o diagnóstico aislado NO bastan por sí solos.
- Si no hay evidencia suficiente usa Por definir.
- transportReason debe citar evidencia visible concreta.

OXÍGENO:
- oxygenProbable=true solo con evidencia visible de oxígeno indicado/usado, hipoxemia o soporte respiratorio. Si no, false.`;

const FLOOR_RESCAN_PROMPT=`Esta imagen contiene un pizarrón de pacientes que subirán a Piso. Haz una SEGUNDA lectura de control enfocada exclusivamente en renglones de Piso. Devuelve SOLO JSON válido:
{"patients":[{"category":"Piso","handwrittenBed":"","formBed":"","bed":"","name":"","sex":"Mujer|Hombre|No visible","destination":"","destinationFloor":"","destinationBlock":"","destinationService":"","service":"","originService":"","recognizedText":"","confidence":{"bed":"high|medium|low","sex":"high|medium|low"},"transport":"Por definir","transportReason":""}]}.
Reglas: el total del encabezado NO crea pacientes. Recorre cada renglón físico de ambas columnas. H=Hombre, M=Mujer por columna. En "C#11 NEFRO", C#11 es bed y NEFRO es destinationService; conserva CE/UP/UI literalmente. Si ves un renglón pero la cama no es legible, devuelve un parcial con bed vacío y recognizedText. Nunca inventes camas para alcanzar el total.`;

const clean=v=>String(v??'').trim();
const plain=v=>clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now=()=>new Date().toISOString();
function read(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}}
function write(key,val){localStorage.setItem(key,JSON.stringify(val))}
function currentRows(){const v=read(STORAGE_KEY,[]);return Array.isArray(v)?v:[]}
function shift(){let s=read(SHIFT_KEY,null);if(!s?.id){s={id:uid(),startedAt:now(),status:'ACTIVE'};write(SHIFT_KEY,s)}return s}
function toast(msg,tone=''){document.getElementById('v80Toast')?.remove();const el=document.createElement('div');el.id='v80Toast';el.className=`v75-toast ${tone}`;el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),3000)}
function setProgress(text){const el=document.getElementById('captureStatus');if(!el)return;el.hidden=!text;el.textContent=text;el.dataset.state=text?'busy':''}

function normalizeBed(v){
  const raw=clean(v);if(!raw||/sala\s+de\s+espera/i.test(raw))return'';
  let s=raw.replace(/^C\/\s*(?=CE\s*\d+)/i,'').trim().toUpperCase().replace(/\s+/g,'');
  let m=s.match(/^CE0*(\d+)$/);if(m)return`CE${Number(m[1])}`;
  m=s.match(/^UP0*(\d+)$/);if(m)return`UP${Number(m[1])}`;
  m=s.match(/^UI0*(\d+)$/);if(m)return`UI${Number(m[1])}`;
  m=s.match(/^UA0*(\d+)$/);if(m)return String(Number(m[1]));
  m=s.match(/^C(?:AMA)?#?0*(\d+)$/);if(m)return String(Number(m[1]));
  if(/^0*\d+$/.test(s))return String(Number(s));
  return raw;
}
function floorBedFromText(value){
  const text=clean(value).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  let match=text.match(/\bC(?:AMA)?\s*#\s*0*(\d{1,3})\b/);
  if(match)return String(Number(match[1]));
  match=text.match(/\b(CE|UP|UI|UA)\s*#?\s*0*(\d{1,3})\b/);
  if(match)return`${match[1]}${Number(match[2])}`;
  return'';
}
function floorServiceFromText(value){
  const text=plain(value);
  if(/\bangio\b|\bcx vas\b|cirugia vascular/.test(text))return'Angiología y Cirugía Vascular';
  if(/\bcx gral\b|cirugia general/.test(text))return'Cirugía General';
  if(/\bnefro\b|nefrolog/.test(text))return'Nefrología';
  if(/\bgastro\b|gastroenter/.test(text))return'Gastroenterología';
  if(/\bgeria\b|geriatr/.test(text))return'Geriatría';
  if(/\bm i\b|medicina interna/.test(text))return'Medicina Interna';
  return'';
}
function normSex(v){const t=plain(v);if(['mujer','femenino','femenina','f'].includes(t))return'Mujer';if(['hombre','masculino','masculina','m','h'].includes(t))return'Hombre';return'No visible'}
function categoryOf(p){const c=plain(p?.category),m=plain(p?.modality),t=plain(p?.target||p?.study);if(c==='piso')return'Piso';if(c==='tac'||m==='tac'||/\b(tac|tc|tomografia|angiotac)\b/.test(t))return'TAC';if(c==='usg'||c==='ultrasonido'||m==='ultrasonido'||/\b(usg|ultrasonido|ecografia)\b/.test(t))return'USG';if(c==='interconsulta')return'Interconsulta';if(c.includes('apoyo'))return'Apoyo para movimiento';return'RX'}
function ageFromBirth(v){const s=clean(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(`${s}T12:00:00`);if(Number.isNaN(d.getTime()))return null;const td=new Date();let a=td.getFullYear()-d.getFullYear();const md=td.getMonth()-d.getMonth();if(md<0||(md===0&&td.getDate()<d.getDate()))a--;return a>=0&&a<=130?a:null}
function inferredDestination(row){const bed=Number(String(row.destination||'').match(/\d+/)?.[0]);if(Number.isFinite(bed)&&bed>0){if(bed<=44)return{destinationFloor:'Primero',destinationBlock:'B'};if(bed<=88)return{destinationFloor:'Segundo',destinationBlock:'B'};if(bed<=132)return{destinationFloor:'Tercero',destinationBlock:'B'};if(bed<=165)return{destinationFloor:'Segundo',destinationBlock:'A'};if(bed<=198)return{destinationFloor:'Tercero',destinationBlock:'A'};if(bed<=231)return{destinationFloor:'Quinto',destinationBlock:'A'}}const s=plain(row.destinationService);if(/nefrolog/.test(s))return{destinationFloor:'Primero',destinationBlock:'B'};if(/cirugia|trauma/.test(s))return{destinationFloor:'Segundo',destinationBlock:'B'};if(/medicina interna|\bmi\b/.test(s))return{destinationFloor:'Tercero',destinationBlock:'B'};if(/obstetric/.test(s))return{destinationFloor:'Segundo',destinationBlock:'A'};if(/pediatr/.test(s))return{destinationFloor:'Tercero',destinationBlock:'A'};if(/ginec/.test(s))return{destinationFloor:'Quinto',destinationBlock:'A'};return{}}
function evidenceText(p){return plain([p?.transportReason,p?.diagnosis,p?.transferNotes,p?.recognizedText,Object.values(p?.extraData||{}).join(' ')].join(' '))}
function transportOf(p,target){
  const requested=plain(p?.transport),e=evidenceText(p),reason=clean(p?.transportReason),targetText=plain(target);
  const explicitNoMove=/\b(no trasladar|no se traslada|sin traslado)\b/.test(e),portable=/\bportatil\b/.test(targetText)||/\bportatil\b/.test(e);
  if(portable||explicitNoMove)return['No trasladar',reason||(portable?'Estudio portátil visible':'Indicación visible de no trasladar')];
  const explicitCamilla=/\b(camilla|en camilla|traslado en camilla)\b/.test(e),strongCamilla=/\b(inmovil|inmovilidad|no deambula|no puede deambular|encamado|hemiplej|paraplej|tetraplej|deficit neurologico motor|fractura desplazada|fractura de femur|fractura de cadera|trauma grave|estado general delicado)\b/.test(e);
  if((requested.includes('camilla')&&(explicitCamilla||strongCamilla))||explicitCamilla||strongCamilla)return['Camilla',reason||'Evidencia visible de limitación para traslado sentado'];
  const explicitSilla=/\b(silla de ruedas|en silla|traslado en silla|puede ir sentado|deambula con apoyo)\b/.test(e);
  if((requested.includes('silla')&&explicitSilla)||explicitSilla)return['Silla',reason||'Indicación visible de traslado sentado'];
  return['Por definir',''];
}

function normalizeRow(p,fp,shiftId,{partial=false,imageAvailable=true}={}){
  const category=categoryOf(p),recognizedText=clean(p?.recognizedText),bed=normalizeBed(p?.handwrittenBed)||normalizeBed(p?.formBed)||normalizeBed(p?.bed)||(category==='Piso'?floorBedFromText(recognizedText):''),rawTarget=clean(p?.target||p?.study||p?.destination),target=category==='Piso'?clean(p?.destination||rawTarget):normalizeStudyDisplay(rawTarget),[transport,transportReason]=transportOf(p,target);
  const confidence=p?.confidence&&typeof p.confidence==='object'?p.confidence:{},reviewFields=Object.entries(confidence).filter(([,v])=>plain(v)==='low').map(([k])=>k);if(partial&&!reviewFields.includes('bed'))reviewFields.push('bed');
  const row={...p,id:uid(),shiftId,category,bed,name:clean(p?.name),birthDate:clean(p?.birthDate),age:normalizeAge(p?.age)??ageFromBirth(p?.birthDate),sex:normSex(p?.sex),target,destination:category==='Piso'?clean(p?.destination||target):clean(p?.destination),destinationFloor:clean(p?.destinationFloor),destinationBlock:clean(p?.destinationBlock),destinationService:clean(p?.destinationService||((category==='Piso'&&!p?.originService)?p?.service:'')||(category==='Piso'?floorServiceFromText(recognizedText):'')),modality:category==='TAC'?'TAC':category==='USG'?'Ultrasonido':category==='RX'?'Rayos X':clean(p?.modality)||'Otro',diagnosis:clean(p?.diagnosis),diagnosisMeaning:clean(p?.diagnosisMeaning),requestingDoctor:clean(p?.requestingDoctor||p?.doctor),folio:clean(p?.folio),service:category==='Piso'?clean(p?.originService):clean(p?.service),originService:clean(p?.originService),requestDate:clean(p?.requestDate),requestTime:clean(p?.requestTime),transferNotes:clean(p?.transferNotes),extraData:p?.extraData&&typeof p.extraData==='object'?p.extraData:{},recognizedText,transport,transportReason,oxygenProbable:Boolean(p?.oxygenProbable),oxygenReason:p?.oxygenProbable?clean(p?.oxygenReason):'',status:'Pendiente',imageFingerprint:fp,boletaImageFingerprint:fp,boletaImageAvailable:imageAvailable,confidence,needsReview:partial||reviewFields.length>0,reviewFields,captureReviewOnly:partial,manualOverrides:{},createdAt:now(),updatedAt:now()};
  if(category==='Piso'){const mapped=inferredDestination(row);if(!row.destinationFloor)row.destinationFloor=mapped.destinationFloor||'';if(!row.destinationBlock)row.destinationBlock=mapped.destinationBlock||''}
  return row;
}
function sameName(a,b){const A=plain(a),B=plain(b);return!!A&&!!B&&(A===B||(A.length>=6&&B.length>=6&&(A.includes(B)||B.includes(A))))}
function merge(existing,incoming){
  const o=existing.manualOverrides||{},pick=f=>o[f]?existing[f]:(incoming[f]!==''&&incoming[f]!==null&&incoming[f]!==undefined?incoming[f]:existing[f]);
  const existingFp=clean(existing.boletaImageFingerprint||existing.imageFingerprint),incomingFp=clean(incoming.boletaImageFingerprint||incoming.imageFingerprint),imageChanged=Boolean(incomingFp&&incomingFp!==existingFp),imageAvailable=imageChanged?incoming.boletaImageAvailable!==false:Boolean(existing.boletaImageAvailable||incoming.boletaImageAvailable);
  return{...existing,...incoming,id:existing.id,createdAt:existing.createdAt,manualOverrides:o,bed:pick('bed'),name:pick('name'),age:pick('age'),sex:pick('sex'),target:pick('target'),transport:pick('transport'),transportReason:pick('transportReason'),destination:incoming.destination||existing.destination,destinationFloor:incoming.destinationFloor||existing.destinationFloor,destinationBlock:incoming.destinationBlock||existing.destinationBlock,destinationService:incoming.destinationService||existing.destinationService,requestingDoctor:incoming.requestingDoctor||existing.requestingDoctor,folio:incoming.folio||existing.folio,service:incoming.service||existing.service,originService:incoming.originService||existing.originService,requestDate:incoming.requestDate||existing.requestDate,requestTime:incoming.requestTime||existing.requestTime,transferNotes:incoming.transferNotes||existing.transferNotes,extraData:{...(existing.extraData||{}),...(incoming.extraData||{})},recognizedText:incoming.recognizedText||existing.recognizedText,boletaImageFingerprint:incomingFp||existingFp,boletaImageAvailable:imageAvailable,imageFingerprint:incoming.imageFingerprint||existing.imageFingerprint,needsReview:Boolean(existing.needsReview||incoming.needsReview),reviewFields:[...new Set([...(existing.reviewFields||[]),...(incoming.reviewFields||[])])],updatedAt:now()};
}
function isHeaderOnly(p){const t=plain(p?.recognizedText);return /^piso(?: total)? \d+$/.test(t)||t==='piso'||(/^\d+$/.test(t)&&plain(p?.category)==='piso')}
function imagingDedupeKey(p,index){
  const category=categoryOf(p),bed=normalizeBed(p?.handwrittenBed)||normalizeBed(p?.formBed)||normalizeBed(p?.bed),origin=bed?canonicalOrigin(bed):'',name=plain(p?.name),target=plain(p?.target||p?.study||p?.destination);
  if(origin)return`${category}:bed:${origin}:name:${name}:target:${target}`;
  if(name)return`${category}:name:${name}:target:${target}`;
  return`${category}:row:${index}:target:${target}`;
}
function dedupePatients(patients){
  const out=[];
  for(const [n,p] of (patients||[]).entries()){
    const category=categoryOf(p),bed=normalizeBed(p?.handwrittenBed)||normalizeBed(p?.formBed)||normalizeBed(p?.bed);
    const key=category==='Piso'&&bed?`Piso:${canonicalOrigin(bed)}`:category==='Piso'?`Piso:partial:${plain(p?.recognizedText)}:${plain(p?.destinationService||p?.service)}:${plain(p?.name)}:${n}`:imagingDedupeKey(p,n);
    const i=out.findIndex(x=>x.key===key);
    if(i<0)out.push({key,p});else out[i].p={...out[i].p,...p,recognizedText:clean(p?.recognizedText)||clean(out[i].p?.recognizedText)};
  }
  return out.map(x=>x.p);
}
function sameImagingIdentity(a,b){
  const aFolio=plain(a?.folio),bFolio=plain(b?.folio);
  if(aFolio&&bFolio)return aFolio===bFolio;
  const aName=clean(a?.name),bName=clean(b?.name);
  if(aName&&bName)return sameName(aName,bName);
  const aDate=plain(a?.requestDate),bDate=plain(b?.requestDate),aTime=plain(a?.requestTime),bTime=plain(b?.requestTime);
  if(aDate&&bDate&&aTime&&bTime)return aDate===bDate&&aTime===bTime;
  const aText=plain(a?.recognizedText),bText=plain(b?.recognizedText);
  return aText.length>=20&&bText.length>=20&&aText===bText;
}
function sameImagingRequest(a,b){
  if(categoryOf(a)==='Piso'||categoryOf(a)!==categoryOf(b))return false;
  const aBed=canonicalOrigin(a?.bed),bBed=canonicalOrigin(b?.bed),aTarget=plain(a?.target),bTarget=plain(b?.target);
  if(aTarget&&bTarget&&aTarget!==bTarget)return false;
  if(aBed&&bBed&&aBed!==bBed)return false;
  return sameImagingIdentity(a,b)&&Boolean(aTarget||bTarget||aBed||bBed);
}
function commitPatients(patients,fp,shiftId,imageAvailable){
  const list=currentRows();let added=0,updated=0,review=0,skipped=0;
  for(const p of dedupePatients(Array.isArray(patients)?patients:[])){
    const provisional=normalizeRow(p,fp,shiftId,{imageAvailable});
    if(provisional.category==='Piso'&&!provisional.bed){
      if(isHeaderOnly(p))continue;
      if(provisional.name||provisional.destinationService||provisional.service||provisional.recognizedText)review++;
      continue;
    }
    if(provisional.category!=='Piso'&&!provisional.bed&&!provisional.name&&!provisional.target)continue;
    const incoming=provisional;
    const exact=list.find(r=>r.shiftId===shiftId&&r.imageFingerprint===fp&&categoryOf(r)===incoming.category&&((incoming.bed&&canonicalOrigin(r.bed)===canonicalOrigin(incoming.bed))||(incoming.name&&sameName(r.name,incoming.name))));
    if(exact){if(plain(exact.status)!=='realizado'){const i=list.findIndex(r=>r.id===exact.id);list[i]=merge(exact,incoming);updated++}else skipped++;continue}
    if(incoming.category==='Piso'){
      const occupied=list.find(r=>r.shiftId===shiftId&&plain(r.status)!=='realizado'&&!r.captureReviewOnly&&categoryOf(r)==='Piso'&&canonicalOrigin(r.bed)===canonicalOrigin(incoming.bed));
      if(occupied){if(sameName(occupied.name,incoming.name)||(!occupied.name&&!incoming.name)){const i=list.findIndex(r=>r.id===occupied.id);list[i]=merge(occupied,incoming);updated++}else skipped++;continue}
    }else{
      const semantic=list.find(r=>r.shiftId===shiftId&&plain(r.status)!=='realizado'&&!r.captureReviewOnly&&sameImagingRequest(r,incoming));
      if(semantic){const i=list.findIndex(r=>r.id===semantic.id);list[i]=merge(semantic,incoming);updated++;continue}
    }
    list.unshift(incoming);added++;
  }
  write(STORAGE_KEY,list);syncRowsFromStorageAndRender();window.dispatchEvent(new CustomEvent('pendientes:v80-updated'));return{added,updated,review,skipped};
}

async function fingerprint(file){const buf=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',buf);return[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function db(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'fp'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function saveImage(fp,file){try{const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put({fp,blob:file,name:file.name||'boleta.jpg',type:file.type||'image/jpeg',createdAt:now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});d.close();return true}catch(e){console.warn('[Pendientes v80] No se pudo guardar foto de boleta',e);return false}}
async function deleteImage(fp){try{const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(fp);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});d.close()}catch(e){console.warn('[Pendientes v80] No se pudo limpiar foto huérfana',e)}}
function parseVision(v){if(v&&typeof v==='object')return v;const s=clean(v),f=s.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()||s;try{return JSON.parse(f)}catch{const a=f.indexOf('{'),b=f.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(f.slice(a,b+1));throw new Error('Respuesta de visión inválida')}}
async function callVision(file,prompt){const form=new FormData();form.append('image',file);form.append('prompt',prompt);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);try{const res=await fetch('/api/turno-rx/vision',{method:'POST',headers:{'X-Turno-RX':'1'},body:form,credentials:'same-origin',signal:controller.signal});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`Error ${res.status}`);return parseVision(data.text||data.answer||data.output_text||data)}catch(e){if(e?.name==='AbortError')throw new Error('El análisis tardó demasiado.');throw e}finally{clearTimeout(timer)}}

function floorRecognitionStats(patients){
  const uniqueBeds=new Set();let partialRows=0;
  for(const p of patients||[]){
    if(categoryOf(p)!=='Piso'||isHeaderOnly(p))continue;
    const bed=normalizeBed(p?.handwrittenBed)||normalizeBed(p?.formBed)||normalizeBed(p?.bed);
    if(bed)uniqueBeds.add(canonicalOrigin(bed));else if(clean(p?.recognizedText)||clean(p?.name)||clean(p?.destinationService||p?.service))partialRows++;
  }
  return{confirmedBeds:uniqueBeds.size,uniqueBeds:[...uniqueBeds],partialRows};
}
function looksLikeFloorBoard(first,patients){if(plain(first?.documentType)==='piso')return true;const text=plain((patients||[]).map(p=>p?.recognizedText).join(' '));if(/\bpiso\b/.test(text)&&/\b(h|m|hombre|mujer)\b/.test(text))return true;const floorRows=(patients||[]).filter(p=>plain(p?.category)==='piso').length;return floorRows>=2}
function referencesImage(fp){return currentRows().some(r=>clean(r.imageFingerprint)===fp||clean(r.boletaImageFingerprint)===fp)}
async function analyzeFile(file,index,total){
  if(!(file instanceof File)||!file.type.startsWith('image/'))throw new Error('Selecciona una imagen válida.');
  if(file.size>MAX_IMAGE_BYTES)throw new Error(`${file.name||'La foto'} pesa más de 8 MB.`);
  setProgress(`Analizando foto ${index+1} de ${total}…`);
  const fp=await fingerprint(file),imageAvailable=await saveImage(fp,file);
  if(!imageAvailable)toast('La boleta se analizará, pero la foto no pudo guardarse en este iPhone.','warning');
  try{
    const first=await callVision(file,VISION_PROMPT);let patients=Array.isArray(first?.patients)?first.patients:[first];
    const boardTotal=Number(first?.floorBoardTotal),boundedTotal=Number.isInteger(boardTotal)&&boardTotal>0&&boardTotal<=40,{confirmedBeds,partialRows}=floorRecognitionStats(patients),floorSignal=boundedTotal||looksLikeFloorBoard(first,patients),shouldRescan=floorSignal&&(!boundedTotal||confirmedBeds<boardTotal);
    if(shouldRescan){
      setProgress(boundedTotal?`Revisando renglones de Piso (${confirmedBeds} camas únicas + ${partialRows} parciales / ${boardTotal})…`:'Revisando renglones de Piso…');
      try{const second=await callVision(file,FLOOR_RESCAN_PROMPT),extra=Array.isArray(second?.patients)?second.patients:[];patients=[...patients,...extra]}catch(e){console.warn('[Pendientes v80] Segunda lectura de Piso no disponible',e)}
    }
    const result=commitPatients(patients,fp,shift().id,imageAvailable);
    if(imageAvailable&&result.added===0&&result.updated===0&&!referencesImage(fp))await deleteImage(fp);
    return result;
  }catch(e){if(imageAvailable&&!referencesImage(fp))await deleteImage(fp);throw e}
}

let processing=false;
const pendingFiles=[];
let batch={total:0,processed:0,added:0,updated:0,errors:0,review:0,skipped:0};
function resetBatch(){batch={total:0,processed:0,added:0,updated:0,errors:0,review:0,skipped:0}}
async function drainFiles(){
  if(processing)return;
  processing=true;
  try{
    while(pendingFiles.length){
      const file=pendingFiles.shift(),index=batch.processed;
      try{const r=await analyzeFile(file,index,batch.total);batch.added+=r.added;batch.updated+=r.updated;batch.review+=r.review;batch.skipped+=r.skipped}
      catch(e){batch.errors++;toast(e?.message||'No se pudo analizar una foto','warning')}
      batch.processed++;
      if(pendingFiles.length)setProgress(`${batch.processed} de ${batch.total} procesadas · ${pendingFiles.length} en espera…`);
    }
  }finally{
    processing=false;
    setProgress('');
    const {added,updated,errors,review,skipped}=batch;
    toast(`${added} agregados${updated?` · ${updated} actualizados`:''}${review?` · ${review} sin cama; vuelve a tomar la foto`:''}${skipped?` · ${skipped} omitidos`:''}${errors?` · ${errors} error${errors===1?'':'es'}`:''}`,errors||review?'warning':'success');
    resetBatch();
    if(pendingFiles.length){batch.total=pendingFiles.length;queueMicrotask(drainFiles)}
  }
}
function processFiles(files){
  const arr=[...(files||[])];if(!arr.length)return;
  pendingFiles.push(...arr);batch.total+=arr.length;
  if(processing)setProgress(`${batch.processed} de ${batch.total} procesadas · ${pendingFiles.length} en espera…`);
  else void drainFiles();
}

document.addEventListener('change',e=>{if(e.target.id!=='galleryInput'&&e.target.id!=='cameraInput')return;e.preventDefault();e.stopImmediatePropagation();const files=e.target.files;e.target.value='';processFiles(files)},true);
window.addEventListener('pendientes:v80-updated',()=>queueMicrotask(()=>document.documentElement.dataset.pendientesBuild=BUILD));
document.documentElement.dataset.pendientesBuild=BUILD;

export { dedupePatients, floorRecognitionStats, sameImagingRequest, sameImagingIdentity, floorBedFromText, floorServiceFromText, commitPatients, processFiles };
