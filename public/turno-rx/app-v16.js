import {PHOTO_JOB_STATES,createPhotoJobs,runPhotoJobs,photoQueueSummary} from './progressive-photo-queue-v45.js';

const STORAGE_KEY='pendientes-table-v2';
const LEGACY_STORAGE_KEY='pendientes-table-v1';
const LEGACY_RX_KEY='turno-rx-patients-v1';
const LEGACY_FLOOR_KEY='turno-rx-floor-v1';
const SHIFT_KEY='pendientes-shift-v1';
const HISTORY_KEY='pendientes-shift-history-v1';
const SHIFT_MAX_AGE_MS=18*60*60*1000;
const UNDO_MS=7000;

const root=typeof document!=='undefined'?document.getElementById('app'):null;
let editingId=null;
let processingPhotos=false;
let photoJobs=[];
let stopPhotoQueue=false;
let undoState=null;
let undoTimer=null;

const ICONS={
  photo:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="9" cy="9" r="1.7"/><path d="m5.5 17 4.2-4.3 3.1 3.1 2.1-2.2 3.6 3.4"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16.5-1 3.5 3.5-1L18.7 7.8a2.1 2.1 0 0 0 0-3l-.5-.5a2.1 2.1 0 0 0-3 0L5 14.5v2Z"/><path d="m13.8 5.7 4.5 4.5"/></svg>'
};

const FLOOR_GROUPS=[
  {key:'primero',label:'Primero'},
  {key:'segundo',label:'Segundo'},
  {key:'tercero',label:'Tercero'},
  {key:'segundo-otra',label:'Segundo de la otra unidad'},
  {key:'tercero-otra',label:'Tercero de la otra unidad'},
  {key:'quinto-otra',label:'Quinto de la otra unidad'},
  {key:'ueh',label:'UEH'},
  {key:'por-ubicar',label:'Destino por ubicar'}
];

const MODALITY_ORDER=['Rayos X','TAC','Ultrasonido','Interconsulta','Apoyo para movimiento','Otro'];

const VISION_PROMPT=`Analiza esta foto de una solicitud, boleta o pizarrón hospitalario para crear pendientes operativos de traslado. Devuelve SOLO JSON válido, sin markdown, con este formato exacto:
{"patients":[{"category":"Rayos X|TAC|USG|Piso|Interconsulta|Apoyo para movimiento","handwrittenBed":"","formBed":"","waitingRoomMarked":false,"bed":"","name":"","birthDate":null,"age":null,"sex":"Mujer|Hombre|No visible","target":"","destination":"","destinationFloor":"","destinationBlock":"","modality":"Rayos X|TAC|Ultrasonido|Otro","region":"","withContrast":false,"diagnosis":"","diagnosisMeaning":"","requestingDoctor":"","service":"","originService":"","requestDate":"","requestTime":"","transferNotes":"","recognizedText":"","confidence":{"bed":"high|medium|low","name":"high|medium|low","age":"high|medium|low","sex":"high|medium|low","target":"high|medium|low"},"transport":"Silla|Camilla|No trasladar|Por definir","transportReason":"","oxygenProbable":false,"oxygenReason":""}]}.

Extrae únicamente datos VISIBLES. No inventes nombres, edades, estudios, diagnósticos, antecedentes, camas, destinos ni hechos clínicos. Si algo clínico no se alcanza a leer con seguridad, déjalo vacío; nunca lo completes por contexto.

CAMA / ÁREA:
- El número de cama puede estar escrito A MANO como un número grande y aislado. Búscalo explícitamente aunque no esté dentro del recuadro CAMA NO. Ponlo en handwrittenBed.
- Si el recuadro impreso contiene UA16, CE1, C15, UI1, UP1 o similar, ponlo en formBed.
- Para bed usa: 1) handwrittenBed; 2) formBed; 3) vacío. Sala de espera NUNCA reemplaza una cama manuscrita.
- CE significa Corta Estancia; UP Urgencias Pediátricas; UI1/UI2 Stabyl. UA y C# son camas ordinarias.
- Si aparece escrito “C/ CE4”, NO lo leas como C1 ni como otra cama: el área es CE4.
- Si la cama o área no es legible, déjala vacía y marca confidence.bed="low". Nunca sustituyas un dato dudoso con Sala de espera.

PIZARRÓN A PISO:
- Si la foto es un pizarrón de pacientes que SUBEN A PISO, cada renglón es ORIGEN EN URGENCIAS -> CAMA DESTINO DE PISO. bed es el origen y target debe ser SOLO la cama destino o área especial visible como UEH.
- Para esos renglones category debe ser "Piso". Guarda también destination con la cama destino visible, destinationFloor con el piso visible y destinationBlock con A/B solo cuando se lean con seguridad. No deduzcas piso o bloque si la foto no lo confirma; la app puede mapear una cama confirmada después.
- En un mismo pizarrón no debe haber dos pacientes distintos en la misma cama de origen. Si parece duplicarse, revisa números parecidos antes de responder.

IMAGENOLOGÍA:
- Usa category "Rayos X", "TAC" o "USG" según corresponda. Usa "Interconsulta" y "Apoyo para movimiento" únicamente cuando la solicitud visible sea realmente de ese tipo. Nunca clasifiques una boleta de imagen como Piso solo porque contenga números.
- target debe contener el estudio solicitado tal como se entiende de la boleta.
- modality SIEMPRE separada: TAC/TC/tomografía/AngioTAC -> TAC; USG/ultrasonido/ecografía -> Ultrasonido; radiografía/RX/tele de tórax/proyecciones AP-lateral-oblicua -> Rayos X. Nunca mezcles TAC ni USG dentro de Rayos X.
- TAC exige una modalidad explícita en el texto del estudio. “Cráneo”, “tórax”, “abdomen”, “pelvis”, “columna” o una extremidad SIN TAC, TC, tomografía o AngioTAC NO se clasifican como TAC: usa Otro si tampoco hay evidencia explícita de otra modalidad.
- region contiene solo la región anatómica visible. withContrast=true únicamente cuando diga expresamente “con contraste” o equivalente inequívoco. requestingDoctor solo si el nombre es visible.
- Reconoce como Rayos X RX, R.X., radiografía, placa, tele de tórax y estudios radiográficos de cráneo, columna, tórax, abdomen, pelvis y extremidades. Una parte anatómica mencionada solo como síntoma o diagnóstico NO es una solicitud de Rayos X.
- Si hay tórax junto con otro estudio, conserva ambos; la interfaz pondrá Tórax primero.
- Si una misma boleta solicita modalidades diferentes, devuelve un objeto por modalidad con los mismos datos del paciente. Agrupa en un solo objeto todos los estudios que sí sean de Rayos X; no dupliques un objeto por cada proyección.
- recognizedText conserva la transcripción literal legible relevante de la boleta para revisión. requestingDoctor, service/originService, requestDate, requestTime y transferNotes solo se llenan cuando sean visibles.
- Marca confidence por campo. Usa "low" si está incompleto, ambiguo o apenas legible; no completes por contexto.

DIAGNÓSTICO / DATO CLÍNICO — MUY IMPORTANTE:
- diagnosis debe conservar TODOS los diagnósticos, antecedentes o síntomas clínicamente relevantes que estén escritos y sean legibles. NO los omitas por enfocarte en el estudio.
- Pon especial atención a EVC, fractura, trauma, pie diabético, miasis, diabetes/DM2, HAS, ERC, diálisis peritoneal/DP, cirrosis, absceso, déficit neurológico, dolor torácico, dificultad respiratoria y cualquier otra condición visible.
- NO deduzcas un diagnóstico por el estudio solicitado. Si solo dice “dolor abdominal”, eso es un síntoma y no debes inventar la causa.
- Conserva calificadores: “antecedente de EVC” significa que ocurrió antes; “probable/PB” significa sospecha no confirmada.
- diagnosisMeaning explica SOLO el diagnóstico/dato clínico en español sencillo y operativo. NO expliques qué significa AP, lateral, simple, tele, TAC o la técnica del estudio. Ejemplo: “EVC: problema de circulación o sangrado en el cerebro que puede afectar fuerza, habla, equilibrio o marcha”. Si diagnosis está vacío, diagnosisMeaning también vacío.

TRASLADO:
- Es una ESTIMACIÓN OPERATIVA, no una orden médica.
- Silla si parece estable y capaz de ir sentado.
- Camilla si hay fractura/trauma importante, inmovilidad, déficit neurológico, alteración marcada de movilidad, estado general delicado o necesidad evidente de ir acostado.
- Si el estudio dice PORTÁTIL, usa “No trasladar”.
- Si no hay base suficiente, “Por definir”.
- transportReason debe explicar brevemente la pista clínica visible que justifica la estimación; no uses solo el nombre del estudio como razón.

OXÍGENO:
- oxygenProbable=true SOLO con evidencia visible de oxígeno indicado/usado, soporte respiratorio, hipoxemia/SpO2 baja o dificultad respiratoria significativa. No lo marques solo por edad, dolor torácico o radiografía de tórax.
- Si oxygenProbable=false, oxygenReason vacío.

SEXO / EDAD:
- sex solo si aparece explícitamente o es inequívoco en la solicitud; si no, “No visible”.
- Si hay fecha de nacimiento visible, usa YYYY-MM-DD; si la edad está explícita, úsala.
- Si hay varios pacientes, devuelve todos.`;

function hasStorage(){return typeof localStorage!=='undefined';}
function read(key,fallback){if(!hasStorage())return fallback;try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
function write(key,value){if(hasStorage())localStorage.setItem(key,JSON.stringify(value));}
function uid(){return globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;}
function clean(value){return String(value??'').trim();}
function esc(value){return String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}

function normalizeBedCandidate(value){
  const text=clean(value);
  if(!text||/sala\s+de\s+espera/i.test(text))return '';
  return text.replace(/^C\/\s*(?=CE\s*\d+)/i,'').trim();
}
function resolveVisionBed(patient){return normalizeBedCandidate(patient?.handwrittenBed)||normalizeBedCandidate(patient?.formBed)||normalizeBedCandidate(patient?.bed);}

function normalizeTransport(value){
  const text=clean(value).toLowerCase();
  if(text.includes('no traslad')||text.includes('portátil')||text.includes('portatil'))return 'No trasladar';
  if(text.includes('camilla'))return 'Camilla';
  if(text.includes('silla'))return 'Silla';
  if(text.includes('definir')||text.includes('pendiente'))return 'Por definir';
  return '';
}
function normalizeSex(value){
  const text=clean(value).toLowerCase();
  if(['mujer','femenino','femenina','f'].includes(text))return 'Mujer';
  if(['hombre','masculino','masculina','m'].includes(text))return 'Hombre';
  return 'No visible';
}
function normalizeAge(value){const text=clean(value);if(!text)return null;const age=Number.parseInt(text,10);return Number.isFinite(age)&&age>=0&&age<=130?age:null;}
function ageFromBirthDate(value){
  const text=clean(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
  const birth=new Date(`${text}T12:00:00`);if(Number.isNaN(birth.getTime()))return null;
  const today=new Date();let age=today.getFullYear()-birth.getFullYear();const month=today.getMonth()-birth.getMonth();
  if(month<0||(month===0&&today.getDate()<birth.getDate()))age-=1;
  return age>=0&&age<=130?age:null;
}

function plain(value){return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function isRayXStudyText(value){
  const text=plain(value);if(!text)return false;
  if(/\b(tac|tomografia|tomografico|usg|ultrasonido|ecografia|laboratorio|interconsulta)\b/.test(text)&&!/\b(rx|rayos x|radiografia|placa)\b/.test(text))return false;
  if(/\b(rx|rayos x|radiografia|radiografias|placa|tele de torax|serie osea|portatil)\b/.test(text))return true;
  if(/\b(dolor|doloroso|trauma|fractura|herida|edema|inflamacion|lesion|diagnostico|antecedente)\b/.test(text))return false;
  const anatomy=/\b(torax|abdomen|craneo|cervical(?:es)?|dorsal(?:es)?|lumbar(?:es)?|columna|pelvis|cadera|hombro|brazo|codo|antebrazo|muneca|mano|femur|rodilla|pierna|tobillo|pie)\b/.test(text);
  const projection=/\b(ap|pa|lateral|oblicua|oblicuo|bilateral|derecha|derecho|izquierda|izquierdo)\b/.test(text);
  return anatomy&&(projection||text.split(' ').length<=4);
}

function confidenceValue(value){const text=plain(value);return text==='high'?'high':text==='medium'?'medium':text==='low'?'low':'';}
function reviewFields(patient){
  const confidence=patient?.confidence&&typeof patient.confidence==='object'?patient.confidence:{};
  const fields=['bed','name','age','sex','target'].filter((field)=>confidenceValue(confidence[field])==='low');
  if(!resolveVisionBed(patient))fields.push('bed');if(!clean(patient?.name))fields.push('name');if(!clean(patient?.target||patient?.study||patient?.destination))fields.push('target');
  return [...new Set(fields)];
}
function normalizedName(value){return plain(value).replace(/\b(de|del|la|las|los)\b/g,' ').replace(/\s+/g,' ').trim();}
function normalizedStudyKey(value){return plain(normalizeStudyDisplay(value)).replace(/\b(rx|rayos x|radiografia|radiografias|placa|ap|pa)\b/g,' ').replace(/\s+/g,' ').trim();}
function patientDedupeKey(row){return [normalizeCategory(row?.category,row?.modality,row?.target),canonicalOrigin(row?.bed),normalizedName(row?.name),normalizedStudyKey(row?.destination||row?.target)].join('|');}
async function imageFingerprint(file){
  if(!(file instanceof File)||!globalThis.crypto?.subtle)return '';
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}

function normalizeModality(value,target=''){
  const explicit=clean(value).toLowerCase();
  const text=clean(target).toLowerCase();
  if(/\b(?:tac|tc)\b|angiotac|tomograf/.test(text))return 'TAC';
  if(/ultrason|usg|ecograf/.test(explicit))return 'Ultrasonido';
  if(/rayos|radiograf|\brx\b/.test(explicit))return 'Rayos X';
  if(/tac|tomograf|\btc\b/.test(explicit))return 'Otro';
  if(explicit==='otro')return 'Otro';
  if(/\busg\b|ultrason|ecograf/.test(text))return 'Ultrasonido';
  if(isRayXStudyText(target))return 'Rayos X';
  return 'Otro';
}

function normalizeCategory(value,modality='',target=''){
  const explicit=clean(value).toLowerCase();
  if(explicit==='piso'||/subir\s+a\s+piso|traslado\s+a\s+piso/.test(explicit))return 'Piso';
  if(/interconsulta/.test(explicit))return 'Interconsulta';
  if(/apoyo(?:\s+para)?\s+(?:el\s+)?movimiento|apoyo\s+movimiento/.test(explicit))return 'Apoyo para movimiento';
  if(/tac|tomograf|^tc$/.test(explicit))return normalizeModality('',target)==='TAC'?'TAC':'Otro';
  if(/usg|ultrason|ecograf/.test(explicit))return 'USG';
  if(/rayos|radiograf|^rx$/.test(explicit))return 'Rayos X';
  const normalized=normalizeModality(modality,target);
  if(normalized==='TAC')return 'TAC';
  if(normalized==='Ultrasonido')return 'USG';
  if(normalized==='Rayos X')return 'Rayos X';
  const targetText=clean(target).toLowerCase();
  if(targetText==='interconsulta')return 'Interconsulta';
  if(/apoyo(?:\s+para)?\s+(?:el\s+)?movimiento/.test(targetText))return 'Apoyo para movimiento';
  return 'Otro';
}

function normalizeStudyDisplay(value){
  let text=clean(value);
  if(!text)return '—';
  text=text
    .replace(/\bprotocolo(?:\s+quir[uú]rgico)?\b/gi,'')
    .replace(/\bsimple\b/gi,'')
    .replace(/\btomograf[ií]a\s+computari[sz]ada\s+de\b/gi,'TAC de')
    .replace(/\btomograf[ií]a\s+de\b/gi,'TAC de')
    .replace(/\bTC\s+de\b/gi,'TAC de')
    .replace(/,\s*(?=[^,]+\s+y\s+)/g,' + ')
    .replace(/\s+y\s+/gi,' + ')
    .replace(/\btele(?:radiograf[ií]a)?\s+de\s+t[óo]rax\b/gi,'Tórax')
    .replace(/\btele\s+t[óo]rax\b/gi,'Tórax')
    .replace(/\bt[óo]rax\b/gi,'Tórax')
    .replace(/\s*\/\s*(?=\+|$)/g,'')
    .replace(/\+\s*\+/g,'+')
    .replace(/\s{2,}/g,' ')
    .replace(/^\s*[+/,-]+\s*|\s*[+/,-]+\s*$/g,'')
    .trim();
  const parts=text.split(/\s*\+\s*/).map((part)=>part.trim()).filter(Boolean);
  if(parts.length>1){
    parts.sort((a,b)=>{const at=/tórax/i.test(a),bt=/tórax/i.test(b);if(at&&!bt)return -1;if(!at&&bt)return 1;return 0;});
    text=parts.join(' + ');
  }
  return text||'—';
}

function displayOrigin(value){
  const original=normalizeBedCandidate(value);
  if(!original)return '—';
  const compact=original.toUpperCase().replace(/\s+/g,'').replace(/#/g,'');
  let match=compact.match(/^UI0*(\d+)$/);if(match)return `UI${Number(match[1])} (Stabyl)`;
  match=compact.match(/^CE0*(\d+)$/);if(match)return `CE${Number(match[1])}`;
  match=compact.match(/^UP0*(\d+)$/);if(match)return `UP${Number(match[1])}`;
  match=compact.match(/^UA0*(\d+)$/);if(match)return String(Number(match[1]));
  match=compact.match(/^C0*(\d+)$/);if(match)return String(Number(match[1]));
  match=compact.match(/^CAMA0*(\d+)$/);if(match)return String(Number(match[1]));
  if(/^0*\d+$/.test(compact))return String(Number(compact));
  if(compact==='UI')return 'UI (Stabyl)';
  return original;
}
function canonicalOrigin(value){const shown=displayOrigin(value).toUpperCase();if(/^\d+$/.test(shown))return `N:${Number(shown)}`;const special=shown.match(/^(CE|UP|UI)(\d+)/);if(special)return `${special[1]}:${Number(special[2])}`;return shown==='—'?'':shown;}
function compareOrigins(a,b){
  const left=displayOrigin(a.bed),right=displayOrigin(b.bed);const ln=/^\d+$/.test(left)?Number(left):null,rn=/^\d+$/.test(right)?Number(right):null;
  if(ln!==null&&rn!==null)return ln-rn;if(ln!==null)return -1;if(rn!==null)return 1;return left.localeCompare(right,'es-MX',{numeric:true,sensitivity:'base'});
}

function parseFloorTarget(value){
  const text=clean(value).toUpperCase().replace(/\s+/g,' ');if(!text)return null;
  if(/^UEH\b/.test(text))return {type:'special',value:'UEH',display:'UEH'};
  const match=text.match(/^(?:CAMA(?: DE PISO)?\s*)?#?\s*(\d{1,3})$/);if(!match)return null;
  const number=Number(match[1]);if(!Number.isFinite(number)||number<=0)return null;
  return {type:'bed',value:number,display:String(number)};
}
function floorGroupKey(target){
  const parsed=parseFloorTarget(target);if(!parsed)return null;if(parsed.type==='special')return 'ueh';const n=parsed.value;
  if(n>=1&&n<=44)return 'primero';if(n>=45&&n<=88)return 'segundo';if(n>=89&&n<=132)return 'tercero';if(n>=133&&n<=165)return 'segundo-otra';if(n>=166&&n<=189)return 'tercero-otra';if(n>=190&&n<=204)return 'quinto-otra';return 'por-ubicar';
}
function explicitFloorGroup(row){
  const floor=clean(row?.destinationFloor||row?.floor).toLowerCase(),block=clean(row?.destinationBlock||row?.block).toLowerCase();
  const other=/\ba\b|otra\s+unidad|otro\s+bloque/.test(block)||/otra\s+unidad/.test(floor);
  if(/quinto|5(?:º|°|o)?/.test(floor)&&other)return 'quinto-otra';
  if(/tercero|3(?:º|°|o)?/.test(floor))return other?'tercero-otra':'tercero';
  if(/segundo|2(?:º|°|o)?/.test(floor))return other?'segundo-otra':'segundo';
  if(/primero|1(?:º|°|o)?/.test(floor))return 'primero';
  return null;
}
function rowFloorGroupKey(row){return explicitFloorGroup(row)||floorGroupKey(row?.destination||row?.target);}
function hasFloorTarget(row){
  const category=normalizeCategory(row?.category,row?.modality,row?.target);
  if(category==='Piso')return true;
  if(clean(row?.category))return false;
  return floorGroupKey(row?.target)!==null;
}
function isCompleteFloorRow(row){return hasFloorTarget(row)&&Boolean(canonicalOrigin(row?.bed))&&Boolean(rowFloorGroupKey(row));}
function isIncompleteFloorRow(row){return hasFloorTarget(row)&&!isCompleteFloorRow(row);}
function findDuplicateFloorOrigins(candidateRows){const seen=new Set(),duplicates=new Set();for(const row of candidateRows.filter((item)=>hasFloorTarget(item))){const key=canonicalOrigin(row.bed);if(!key)continue;if(seen.has(key))duplicates.add(displayOrigin(row.bed));seen.add(key);}return [...duplicates].sort((a,b)=>a.localeCompare(b,'es-MX',{numeric:true}));}
function findConflictsAgainstExisting(existingRows,incomingRows,excludeId=null){
  const active=new Map();for(const row of existingRows){if(row.id===excludeId||!hasFloorTarget(row))continue;const key=canonicalOrigin(row.bed);if(key)active.set(key,row);}
  const conflicts=new Set(),incomingSeen=new Set();for(const row of incomingRows.filter((item)=>hasFloorTarget(item))){const key=canonicalOrigin(row.bed);if(!key)continue;if(active.has(key)||incomingSeen.has(key))conflicts.add(displayOrigin(row.bed));incomingSeen.add(key);}
  return [...conflicts].sort((a,b)=>a.localeCompare(b,'es-MX',{numeric:true}));
}
function normalizedTarget(value){const parsed=parseFloorTarget(value);return parsed?parsed.display.toLowerCase():clean(value).toLowerCase().replace(/\s+/g,' ');}
function rowKey(row){return patientDedupeKey(row);}
function canonicalName(value){return normalizedName(value).replace(/\s+/g,'');}
function oneEditApart(a,b){if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}return edits+(i<a.length||j<b.length?1:0)<=1;}
function findMatchingRowIndex(list,incoming){
  if(incoming?.imageFingerprint){
    const incomingBed=canonicalOrigin(incoming?.bed),incomingName=normalizedName(incoming?.name),incomingCategory=normalizeCategory(incoming?.category,incoming?.modality,incoming?.target);
    const exactImage=list.findIndex((row)=>{if(row?.imageFingerprint!==incoming.imageFingerprint||normalizeCategory(row?.category,row?.modality,row?.target)!==incomingCategory)return false;const rowBed=canonicalOrigin(row?.bed),rowName=normalizedName(row?.name);return Boolean((incomingBed&&rowBed===incomingBed)||(incomingName&&rowName&&(incomingName===rowName||incomingName.includes(rowName)||rowName.includes(incomingName))));});
    if(exactImage>=0)return exactImage;
  }
  const key=rowKey(incoming);if(key==='|||')return -1;const exact=list.findIndex((row)=>rowKey(row)===key);if(exact>=0)return exact;
  const incomingName=canonicalName(incoming?.name),origin=canonicalOrigin(incoming?.bed),category=normalizeCategory(incoming?.category,incoming?.modality,incoming?.target);
  if(!origin||incomingName.length<6)return -1;
  return list.findIndex((row)=>canonicalOrigin(row?.bed)===origin&&normalizeCategory(row?.category,row?.modality,row?.target)===category&&canonicalName(row?.name).length>=6&&oneEditApart(canonicalName(row?.name),incomingName));
}
function mergeStudyTargets(a,b){const values=[a,b].flatMap((value)=>clean(value).split(/\s*\+\s*/)).filter(Boolean),seen=new Set();return values.filter((value)=>{const key=normalizeStudyDisplay(value).toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).join(' + ');}

function newShiftMeta(){return {id:uid(),startedAt:new Date().toISOString()};}
function archiveShift(shiftMeta,shiftRows){if(!shiftRows.length||!hasStorage())return;const history=read(HISTORY_KEY,[]);write(HISTORY_KEY,[{shift:shiftMeta,rows:shiftRows,archivedAt:new Date().toISOString()},...history].slice(0,7));}
function upgradeRow(row,shiftId){
  const target=clean(row?.target||row?.study||row?.destination),legacyFloor=!clean(row?.category)&&Boolean(clean(row?.destination)||floorGroupKey(target)),category=legacyFloor?'Piso':normalizeCategory(row?.category,row?.modality,target);
  const portable=/port[áa]til/i.test(target);
  return {...row,id:row?.id||uid(),shiftId:shiftId||row?.shiftId,bed:normalizeBedCandidate(row?.bed),name:clean(row?.name),age:normalizeAge(row?.age),sex:normalizeSex(row?.sex),target,destination:clean(row?.destination),destinationFloor:clean(row?.destinationFloor||row?.floor),destinationBlock:clean(row?.destinationBlock||row?.block),category,modality:normalizeModality(row?.modality,target),region:clean(row?.region),withContrast:Boolean(row?.withContrast),requestingDoctor:clean(row?.requestingDoctor),status:clean(row?.status)||'Pendiente',diagnosis:clean(row?.diagnosis),diagnosisMeaning:clean(row?.diagnosisMeaning),transport:portable?'No trasladar':(normalizeTransport(row?.transport)||'Por definir'),transportReason:clean(row?.transportReason),oxygenProbable:Boolean(row?.oxygenProbable),oxygenReason:row?.oxygenProbable?clean(row?.oxygenReason):'',needsReview:Boolean(row?.needsReview),reviewFields:Array.isArray(row?.reviewFields)?row.reviewFields:[],recognizedText:clean(row?.recognizedText),imageFingerprint:clean(row?.imageFingerprint),createdAt:row?.createdAt||new Date().toISOString()};
}
function bootstrapState(){
  let shift=read(SHIFT_KEY,null),current=read(STORAGE_KEY,null);if(!Array.isArray(current))current=read(LEGACY_STORAGE_KEY,null);
  if(!Array.isArray(current)){
    const rx=read(LEGACY_RX_KEY,[]),floor=read(LEGACY_FLOOR_KEY,[]);
    current=[...rx.filter((p)=>p?.status!=='Realizado').map((p)=>({id:p.id||uid(),bed:p.bed||'',name:p.name||'',age:normalizeAge(p.age),target:p.study||'',transport:p.transport||'Por definir',transportReason:p.transportReason||'',oxygenProbable:Boolean(p.oxygenProbable),oxygenReason:p.oxygenReason||'',createdAt:p.createdAt||new Date().toISOString()})),...floor.filter((p)=>p?.status!=='Realizado').map((p)=>({id:p.id||uid(),bed:p.bed||'',name:p.name||'',age:normalizeAge(p.age),target:p.destination||'',transport:p.transport||'Por definir',transportReason:p.transportReason||'',oxygenProbable:Boolean(p.oxygenProbable),oxygenReason:p.oxygenReason||'',createdAt:p.createdAt||new Date().toISOString()}))];
  }
  if(!shift)shift=newShiftMeta();const started=Date.parse(shift.startedAt||''),expired=Number.isFinite(started)&&Date.now()-started>SHIFT_MAX_AGE_MS;
  if(expired){archiveShift(shift,current);shift=newShiftMeta();current=[];}
  current=current.map((row)=>upgradeRow(row,shift.id));write(SHIFT_KEY,shift);write(STORAGE_KEY,current);return {shift,rows:current};
}
let {shift,rows}=bootstrapState();
function save(){write(STORAGE_KEY,rows);write(SHIFT_KEY,shift);}

function effectiveTransport(row){if(/port[áa]til/i.test(clean(row?.target)))return 'No trasladar';return normalizeTransport(row?.transport)||'Por definir';}
function transportRank(row){const t=effectiveTransport(row);if(t==='Silla')return 0;if(t==='Camilla')return 1;if(t==='No trasladar')return 2;return 3;}
function compareFloorRows(a,b){const transport=transportRank(a)-transportRank(b);return transport||compareOrigins(a,b);}
function compareImagingRows(a,b){
  const urgency=(row)=>row?.clinicalUrgencyConfirmed===true||/\burgente\b/i.test(clean(row?.urgency))?0:1;
  const ur=urgency(a)-urgency(b);if(ur)return ur;
  const tr=transportRank(a)-transportRank(b);if(tr)return tr;
  const aa=normalizeAge(a.age),ba=normalizeAge(b.age);if(aa!==null&&ba!==null&&aa!==ba)return aa-ba;if(aa!==null&&ba===null)return -1;if(aa===null&&ba!==null)return 1;
  const sexRank=(row)=>normalizeSex(row.sex)==='Mujer'?0:normalizeSex(row.sex)==='Hombre'?1:2;
  const sr=sexRank(a)-sexRank(b);if(sr)return sr;
  return compareOrigins(a,b);
}
function isCriticalDiagnosis(value){return /\b(evc|fractur|miasis|pie\s+diab|sepsis|absceso|tce|ictus|evento\s+vascular|hemorrag|infarto|disnea|hipox|cirrosis|erc|di[aá]lisis)\b/i.test(clean(value));}

function renderTransport(row){
  const type=effectiveTransport(row);const icon=type==='Camilla'?'🛏️':type==='Silla'?'♿':type==='No trasladar'?'🚫':'•';const klass=type==='Camilla'?'camilla':type==='Silla'?'silla':type==='No trasladar'?'no-transfer':'unset';const reason=clean(row.transportReason);
  return `<div class="transport-main ${klass}"><span>${icon}</span><b>${esc(type)}</b></div><div class="transport-reason ${reason?'':'is-empty'}"><span>Motivo</span>${esc(reason||'—')}</div>${row.oxygenProbable?`<div class="oxygen-chip">O₂${row.oxygenReason?` · ${esc(row.oxygenReason)}`:''}</div>`:''}`;
}
function renderFloorRow(row,incomplete=false){const destination=parseFloorTarget(row.destination||row.target)?.display||clean(row.destination||row.target)||'—',transport=effectiveTransport(row),realized=clean(row.status).toLowerCase()==='realizado';return `<tr class="patient-row floor-patient-row ${incomplete?'incomplete-row':''} ${realized?'is-realized':''}" data-id="${esc(row.id)}" data-status="${realized?'Realizado':'Pendiente'}" title="Toca para editar"><td class="floor-origin"><strong>${incomplete?'⚠️ Falta':esc(displayOrigin(row.bed))}</strong></td><td class="floor-destination"><div class="floor-destination-line"><strong>${esc(destination)}</strong><span class="floor-transport">${transport==='Silla'?'♿ Silla':transport==='Camilla'?'🛏️ Camilla':'• Por definir'}</span>${realized?'<span class="floor-status">✓ Realizado</span>':''}<button class="remove-btn" type="button" data-remove="${esc(row.id)}" aria-label="Quitar paciente">×</button></div></td></tr>`;}
function renderFloorSections(floorRows){
  if(!floorRows.length)return '';const groups=new Map(FLOOR_GROUPS.map((group)=>[group.key,[]]));for(const row of floorRows)groups.get(rowFloorGroupKey(row))?.push(row);for(const list of groups.values())list.sort(compareFloorRows);
  const sections=FLOOR_GROUPS.map((group)=>({...group,rows:groups.get(group.key)||[]})).filter((group)=>group.rows.length).map((group)=>`<section class="floor-group"><div class="floor-group-title">${esc(group.label)} — <strong>${group.rows.length} ${group.rows.length===1?'paciente':'pacientes'}</strong></div><div class="floor-table-wrap"><table class="floor-group-table"><thead><tr><th>Origen</th><th>Destino</th></tr></thead><tbody>${group.rows.map((row)=>renderFloorRow(row)).join('')}</tbody></table></div></section>`).join('');
  return `<section class="floor-board" aria-label="Pacientes a piso">${sections}<div class="floor-total">Total: <strong>${floorRows.length} ${floorRows.length===1?'paciente':'pacientes'}</strong></div></section>`;
}
function renderIncompleteFloor(incompleteRows){if(!incompleteRows.length)return '';return `<section class="incomplete-section"><div class="incomplete-title">⚠️ Por revisar — <strong>${incompleteRows.length}</strong></div><div class="incomplete-note">No cuentan en el total hasta tener Origen + Destino.</div><div class="floor-table-wrap"><table class="floor-group-table"><thead><tr><th>Origen</th><th>Destino</th></tr></thead><tbody>${incompleteRows.map((row)=>renderFloorRow(row,true)).join('')}</tbody></table></div></section>`;}

function renderImagingRow(row){
  const age=normalizeAge(row.age),sex=normalizeSex(row.sex),diagnosis=clean(row.diagnosis),meaning=clean(row.diagnosisMeaning);const critical=isCriticalDiagnosis(diagnosis);
  const patientMeta=[age!==null?`${age} años`:'',sex!=='No visible'?sex:''].filter(Boolean).join(' · ');
  const indicators=`${row.withContrast?'<span class="tac-indicator">Contraste</span>':''}${row.oxygenProbable?'<span class="tac-indicator tac-o2">O₂</span>':''}`;
  return `<tr class="patient-row imaging-row" data-id="${esc(row.id)}" data-modality="${esc(normalizeModality(row.modality,row.target))}" title="Toca para editar">
    <td class="bed-cell" data-label="Origen"><span>${esc(displayOrigin(row.bed))}</span></td>
    <td class="name-cell" data-label="Paciente"><div class="patient-name">${esc(row.name||'—')}</div>${patientMeta?`<div class="age-line">${esc(patientMeta)}</div>`:''}${row.needsReview?'<div class="age-line">⚠️ Revisar lectura</div>':''}</td>
    <td class="transport-cell" data-label="Traslado">${renderTransport(row)}</td>
    <td class="study-cell" data-label="Estudio">${esc(normalizeStudyDisplay(row.target))}${indicators?`<div class="tac-indicators">${indicators}</div>`:''}</td>
    <td class="diagnosis-cell ${critical?'critical':''}" data-label="Diagnóstico">${diagnosis?esc(diagnosis):'<span class="unknown-clinical">No visible</span>'}</td>
    <td class="meaning-cell" data-label="Qué significa">${meaning?esc(meaning):'<span class="unknown-clinical">—</span>'}</td>
    <td class="action-cell" data-label=""><button class="remove-btn" type="button" data-remove="${esc(row.id)}" aria-label="Quitar paciente">×</button></td>
  </tr>`;
}
function renderModalitySection(modality,list){
  if(!list.length)return '';const sorted=[...list].sort(compareImagingRows);const label=modality==='Otro'?'Otros estudios':modality;
  return `<section class="modality-section modality-${modality.toLowerCase().replace(/\s+/g,'-')}" aria-label="${esc(label)}"><div class="modality-title">${esc(label)} — <strong>${sorted.length}</strong></div><div class="table-wrap imaging-table-wrap"><table class="patient-table imaging-table"><colgroup><col class="col-origin"/><col class="col-patient"/><col class="col-move"/><col class="col-study"/><col class="col-diagnosis"/><col class="col-meaning"/><col class="col-action"/></colgroup><thead><tr><th>Origen</th><th>Paciente</th><th>Traslado</th><th>Estudio</th><th>Diagnóstico</th><th>Qué significa</th><th></th></tr></thead><tbody>${sorted.map(renderImagingRow).join('')}</tbody></table></div></section>`;
}
function renderImagingSections(imagingRows){
  if(!imagingRows.length)return '';const groups=new Map(MODALITY_ORDER.map((name)=>[name,[]]));for(const row of imagingRows){const category=normalizeCategory(row.category,row.modality,row.target),modality=category==='USG'?'Ultrasonido':category;groups.get(groups.has(modality)?modality:'Otro')?.push(row);}
  return `<section class="imaging-board" aria-label="Imagenología">${MODALITY_ORDER.map((name)=>renderModalitySection(name,groups.get(name)||[])).join('')}</section>`;
}
function renderEmpty(){return `<section class="table-wrap" aria-label="Pacientes pendientes"><table class="patient-table"><tbody><tr class="empty-row"><td colspan="7"><div class="empty-state"><div class="empty-icon">＋</div><b>Sin pendientes</b><span>Usa foto o lápiz para capturar.</span></div></td></tr></tbody></table></section>`;}
function renderUndo(){if(!undoState||undoState.expiresAt<=Date.now())return '';return `<div class="undo-bar" role="status"><span>Paciente quitado</span><button type="button" id="undoRemove">Deshacer</button></div>`;}
function renderPhotoQueue(){
  if(!photoJobs.length)return '';
  const summary=photoQueueSummary(photoJobs),active=photoJobs.find((job)=>job.state===PHOTO_JOB_STATES.ANALYZING);
  const headline=active?`Analizando foto ${active.index+1} de ${summary.total}`:`${summary.processed} de ${summary.total} procesadas`;
  const detail=`${summary.added} ${summary.added===1?'paciente agregado':'pacientes agregados'}${summary.review?` · ${summary.review} requiere revisión`:''}${summary.errors?` · ${summary.errors} con error`:''}`;
  const jobs=photoJobs.map((job)=>`<div class="photo-job" data-state="${esc(job.state)}"><span class="photo-job-name">Foto ${job.index+1}</span><span class="photo-job-state">${esc(job.state)}${job.state===PHOTO_JOB_STATES.ERROR?` <button type="button" data-retry-photo="${esc(job.id)}">Reintentar</button>`:''}</span></div>`).join('');
  return `<section class="photo-queue" aria-live="polite"><div class="photo-queue-head"><div><strong>${esc(headline)}</strong><div class="photo-queue-summary">${esc(detail)}</div></div><div class="photo-queue-actions">${processingPhotos?'<button type="button" id="stopPhotoQueue">Detener análisis</button>':''}</div></div><div class="photo-jobs">${jobs}</div></section>`;
}

function render(){
  if(!root)return;const activeRows=rows.filter((row)=>!(row?.status==='Realizado'&&normalizeCategory(row?.category,row?.modality,row?.target)==='TAC')),floorRows=activeRows.filter(isCompleteFloorRow),incompleteRows=activeRows.filter(isIncompleteFloorRow),imagingRows=activeRows.filter((row)=>!hasFloorTarget(row));
  const body=activeRows.length?`${renderFloorSections(floorRows)}${renderIncompleteFloor(incompleteRows)}${renderImagingSections(imagingRows)}`:renderEmpty();
  root.innerHTML=`<main class="app-shell"><header class="topbar"><div class="brand"><span class="brand-dot"></span><h1>Pendientes</h1></div><div class="capture-actions" aria-label="Opciones"><button class="shift-btn" id="newShift" type="button" aria-label="Iniciar nuevo turno">↻ Turno</button><button class="capture-icon-btn" id="galleryCapture" type="button" aria-label="Elegir foto">${ICONS.photo}</button><button class="capture-icon-btn manual" id="manualCapture" type="button" aria-label="Captura manual">${ICONS.pencil}</button></div><input id="galleryInput" type="file" accept="image/*" multiple hidden /></header><div class="capture-status" id="captureStatus" hidden></div>${renderPhotoQueue()}${body}</main>${renderUndo()}<div class="sheet-backdrop" id="sheetBackdrop" hidden><form class="capture-sheet" id="patientForm"><div class="sheet-handle"></div><div class="sheet-head"><div><div class="sheet-kicker">PENDIENTE</div><h2 id="sheetTitle">Capturar paciente</h2></div><button type="button" class="close-btn" id="closeSheet" aria-label="Cerrar">×</button></div><div class="form-grid">
    <label><span>Cama / área</span><input id="bed" name="bed" autocomplete="off" placeholder="15, CE2, UP1, UI1…" /></label>
    <label><span>Edad</span><input id="age" name="age" type="number" inputmode="numeric" min="0" max="130" autocomplete="off" placeholder="Años" /></label>
    <label class="full"><span>Nombre</span><input id="name" name="name" autocomplete="off" placeholder="Nombre del paciente" /></label>
    <label><span>Sexo</span><select id="sex" name="sex"><option value="No visible">No visible</option><option value="Mujer">Mujer</option><option value="Hombre">Hombre</option></select></label>
    <label><span>Modalidad</span><select id="modality" name="modality"><option value="Rayos X">Rayos X</option><option value="TAC">TAC</option><option value="Ultrasonido">Ultrasonido</option><option value="Otro">Otro</option></select></label>
    <label class="full"><span>Destino / estudio</span><input id="target" name="target" autocomplete="off" placeholder="72, UEH, Tórax + abdomen, TAC…" /></label>
    <label class="full"><span>Diagnóstico / dato clínico</span><input id="diagnosis" name="diagnosis" autocomplete="off" placeholder="EVC, fractura, pie diabético…" /></label>
    <label class="full"><span>Qué significa</span><input id="diagnosisMeaning" name="diagnosisMeaning" autocomplete="off" placeholder="Explicación clínica en palabras normales" /></label>
    <label><span>Traslado más probable</span><select id="transport" name="transport"><option value="Silla">Silla</option><option value="Camilla">Camilla</option><option value="No trasladar">No trasladar</option><option value="Por definir">Por definir</option></select></label>
    <label><span>Por qué</span><input id="transportReason" name="transportReason" autocomplete="off" placeholder="Razón clínica breve" /></label>
    <label class="oxygen-toggle full"><input id="oxygenProbable" name="oxygenProbable" type="checkbox"/><span class="toggle-ui"></span><span class="toggle-copy"><b>O₂ probable</b><small>Solo si realmente parece necesario.</small></span></label>
    <label class="full oxygen-reason" id="oxygenReasonWrap" hidden><span>Por qué O₂</span><input id="oxygenReason" name="oxygenReason" autocomplete="off" placeholder="Razón breve" /></label>
  </div><div class="form-error" id="formError" hidden></div><button class="save-btn" type="submit">Guardar pendiente</button></form></div>`;
  bind();
}

function bind(){
  document.getElementById('galleryCapture')?.addEventListener('click',()=>document.getElementById('galleryInput')?.click());
  document.getElementById('manualCapture')?.addEventListener('click',()=>openSheet());
  document.getElementById('newShift')?.addEventListener('click',startNewShift);
  document.getElementById('galleryInput')?.addEventListener('change',handlePhotoInput);
  document.getElementById('closeSheet')?.addEventListener('click',closeSheet);
  document.getElementById('sheetBackdrop')?.addEventListener('click',(event)=>{if(event.target.id==='sheetBackdrop')closeSheet();});
  document.querySelectorAll('.patient-row').forEach((tr)=>tr.addEventListener('click',(event)=>{if(event.target.closest('[data-remove]'))return;openSheet(tr.dataset.id);}));
  document.querySelectorAll('[data-remove]').forEach((button)=>button.addEventListener('click',()=>removeRow(button.dataset.remove)));
  document.getElementById('patientForm')?.addEventListener('submit',submitForm);
  document.getElementById('oxygenProbable')?.addEventListener('change',syncOxygenField);
  document.getElementById('undoRemove')?.addEventListener('click',undoRemove);
  document.getElementById('stopPhotoQueue')?.addEventListener('click',()=>{stopPhotoQueue=true;});
  document.querySelectorAll('[data-retry-photo]').forEach((button)=>button.addEventListener('click',()=>retryPhotoJob(button.dataset.retryPhoto)));
}
function setCaptureStatus(message,state='busy'){const status=document.getElementById('captureStatus');if(!status)return;if(!message){status.hidden=true;status.textContent='';status.dataset.state='';return;}status.hidden=false;status.dataset.state=state;status.textContent=message;}
function setFormError(message=''){const error=document.getElementById('formError');if(!error)return;error.hidden=!message;error.textContent=message;}
function parseVisionJSON(value){if(value&&typeof value==='object')return value;const raw=clean(value);if(!raw)throw new Error('La IA no devolvió datos.');const fenced=raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim(),source=fenced||raw;try{return JSON.parse(source);}catch{const start=source.indexOf('{'),end=source.lastIndexOf('}');if(start>=0&&end>start)return JSON.parse(source.slice(start,end+1));throw new Error('No pude interpretar los datos de la foto.');}}

function normalizeVisionRow(patient,fingerprint=''){
  const age=normalizeAge(patient?.age)??ageFromBirthDate(patient?.birthDate),oxygenProbable=Boolean(patient?.oxygenProbable),category=normalizeCategory(patient?.category,patient?.modality,patient?.target||patient?.study),destination=clean(patient?.destination),target=category==='Piso'?(destination||clean(patient?.target)):clean(patient?.target||patient?.study||destination),portable=/port[áa]til/i.test(target);
  const diagnosis=clean(patient?.diagnosis),diagnosisMeaning=diagnosis?clean(patient?.diagnosisMeaning):'';
  const uncertain=reviewFields(patient);
  return {id:uid(),shiftId:shift.id,bed:resolveVisionBed(patient),name:clean(patient?.name),age,sex:normalizeSex(patient?.sex),category,target,destination:category==='Piso'?target:destination,destinationFloor:category==='Piso'?clean(patient?.destinationFloor):'',destinationBlock:category==='Piso'?clean(patient?.destinationBlock):'',modality:normalizeModality(patient?.modality,target),region:clean(patient?.region),withContrast:Boolean(patient?.withContrast)&&/contraste/i.test(target),status:'Pendiente',diagnosis,diagnosisMeaning,requestingDoctor:clean(patient?.requestingDoctor||patient?.doctor),service:clean(patient?.service),originService:clean(patient?.originService),requestDate:clean(patient?.requestDate),requestTime:clean(patient?.requestTime),transferNotes:clean(patient?.transferNotes),recognizedText:clean(patient?.recognizedText),confidence:patient?.confidence&&typeof patient.confidence==='object'?patient.confidence:{},needsReview:uncertain.length>0,reviewFields:uncertain,imageFingerprint:fingerprint,transport:portable?'No trasladar':(normalizeTransport(patient?.transport)||'Por definir'),transportReason:clean(patient?.transportReason),oxygenProbable,oxygenReason:oxygenProbable?clean(patient?.oxygenReason):'',createdAt:new Date().toISOString()};
}
async function analyzePhoto(file){
  if(!(file instanceof File)||!file.type.startsWith('image/'))throw new Error('Selecciona una imagen.');if(file.size>8*1024*1024)throw new Error(`${file.name||'La foto'} pesa más de 8 MB.`);
  const fingerprint=await imageFingerprint(file),form=new FormData();form.append('image',file);form.append('prompt',VISION_PROMPT);
  const response=await fetch('/api/turno-rx/vision',{method:'POST',headers:{'X-Turno-RX':'1'},body:form,credentials:'same-origin'}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`No se pudo analizar la foto (${response.status}).`);
  const parsed=parseVisionJSON(data.text||data.answer||data.output_text||data),patients=Array.isArray(parsed?.patients)?parsed.patients:[parsed];return patients.map((patient)=>normalizeVisionRow(patient,fingerprint)).filter((row)=>row.bed||row.name||row.target);
}
function mergeRow(existing,incoming){
  const incomingTransport=normalizeTransport(incoming.transport),existingTransport=normalizeTransport(existing.transport),category=incoming.category||existing.category||'Otro',target=category==='Piso'?(incoming.target||existing.target||''):mergeStudyTargets(existing.target,incoming.target),portable=/port[áa]til/i.test(target);
  return {...existing,bed:incoming.bed||normalizeBedCandidate(existing.bed)||'',name:incoming.name||existing.name||'',age:incoming.age??normalizeAge(existing.age),sex:incoming.sex&&incoming.sex!=='No visible'?incoming.sex:normalizeSex(existing.sex),category,target,destination:incoming.destination||existing.destination||'',destinationFloor:incoming.destinationFloor||existing.destinationFloor||'',destinationBlock:incoming.destinationBlock||existing.destinationBlock||'',modality:normalizeModality(incoming.modality||existing.modality,target),region:incoming.region||existing.region||'',withContrast:Boolean(existing.withContrast||incoming.withContrast),status:existing.status||incoming.status||'Pendiente',diagnosis:incoming.diagnosis||existing.diagnosis||'',diagnosisMeaning:incoming.diagnosisMeaning||existing.diagnosisMeaning||'',requestingDoctor:incoming.requestingDoctor||existing.requestingDoctor||'',service:incoming.service||existing.service||'',originService:incoming.originService||existing.originService||'',requestDate:incoming.requestDate||existing.requestDate||'',requestTime:incoming.requestTime||existing.requestTime||'',transferNotes:incoming.transferNotes||existing.transferNotes||'',recognizedText:incoming.recognizedText||existing.recognizedText||'',confidence:{...(existing.confidence||{}),...(incoming.confidence||{})},needsReview:Boolean(existing.needsReview||incoming.needsReview),reviewFields:[...new Set([...(existing.reviewFields||[]),...(incoming.reviewFields||[])])],imageFingerprint:incoming.imageFingerprint||existing.imageFingerprint||'',transport:portable?'No trasladar':(incomingTransport&&incomingTransport!=='Por definir'?incomingTransport:(existingTransport||incomingTransport||'Por definir')),transportReason:incoming.transportReason||existing.transportReason||'',oxygenProbable:Boolean(existing.oxygenProbable||incoming.oxygenProbable),oxygenReason:incoming.oxygenReason||existing.oxygenReason||''};
}
function addAnalyzedRows(incomingRows){const next=[...rows];for(const incoming of incomingRows){const index=findMatchingRowIndex(next,incoming);if(index>=0)next[index]=mergeRow(next[index],incoming);else next.unshift(incoming);}rows=next;save();}
function commitPhotoResult(analyzed){
  const duplicates=findDuplicateFloorOrigins(analyzed),conflicts=findConflictsAgainstExisting(rows,analyzed),blocked=[...new Set([...duplicates,...conflicts])];
  if(blocked.length)return {patientsAdded:0,requiresReview:true,reviewReason:`Revisa ${blocked.length===1?`la cama ${blocked[0]}`:`las camas ${blocked.join(', ')}`}; no se agregó esa lectura.`};
  const before=rows.length;addAnalyzedRows(analyzed);render();return {patientsAdded:Math.max(0,rows.length-before)};
}
async function processCurrentPhotoJobs(jobs=photoJobs){
  processingPhotos=true;stopPhotoQueue=false;render();
  try{
    await runPhotoJobs(jobs,{analyze:analyzePhoto,commit:commitPhotoResult,shouldStop:()=>stopPhotoQueue,onUpdate:()=>render()});
    const summary=photoQueueSummary(photoJobs),state=summary.errors||summary.review?'error':'success';
    setCaptureStatus(`${summary.processed} de ${summary.total} procesadas · ${summary.added} ${summary.added===1?'paciente agregado':'pacientes agregados'}${summary.pending?` · ${summary.pending} sin analizar`:''}.`,state);
  }finally{processingPhotos=false;render();}
}
async function retryPhotoJob(id){
  if(processingPhotos)return;const job=photoJobs.find((item)=>item.id===id);if(!job||job.state!==PHOTO_JOB_STATES.ERROR)return;job.state=PHOTO_JOB_STATES.WAITING;await processCurrentPhotoJobs([job]);
}
async function handlePhotoInput(event){
  const input=event.currentTarget,files=[...(input.files||[])];input.value='';if(!files.length||processingPhotos)return;photoJobs=createPhotoJobs(files);setCaptureStatus(`0 de ${files.length} procesadas · ${files.length} recibidas.`);await processCurrentPhotoJobs();
}
function syncOxygenField(){const checked=document.getElementById('oxygenProbable')?.checked,wrap=document.getElementById('oxygenReasonWrap');if(wrap)wrap.hidden=!checked;}
function openSheet(id=null){
  editingId=id;const row=rows.find((item)=>item.id===id),backdrop=document.getElementById('sheetBackdrop');
  document.getElementById('sheetTitle').textContent=row?'Editar paciente':'Capturar paciente';
  document.getElementById('bed').value=row?.bed||'';document.getElementById('age').value=normalizeAge(row?.age)??'';document.getElementById('name').value=row?.name||'';document.getElementById('sex').value=normalizeSex(row?.sex);document.getElementById('target').value=row?.target||'';document.getElementById('modality').value=normalizeModality(row?.modality,row?.target);document.getElementById('diagnosis').value=row?.diagnosis||'';document.getElementById('diagnosisMeaning').value=row?.diagnosisMeaning||'';document.getElementById('transport').value=effectiveTransport(row||{});document.getElementById('transportReason').value=row?.transportReason||'';document.getElementById('oxygenProbable').checked=Boolean(row?.oxygenProbable);document.getElementById('oxygenReason').value=row?.oxygenReason||'';setFormError('');syncOxygenField();backdrop.hidden=false;document.body.classList.add('sheet-open');requestAnimationFrame(()=>document.getElementById('bed')?.focus());
}
function closeSheet(){editingId=null;const backdrop=document.getElementById('sheetBackdrop');if(backdrop)backdrop.hidden=true;document.body.classList.remove('sheet-open');}
function submitForm(event){
  event.preventDefault();const form=new FormData(event.currentTarget),oxygenProbable=document.getElementById('oxygenProbable')?.checked||false,target=clean(form.get('target')),portable=/port[áa]til/i.test(target);
  const diagnosis=clean(form.get('diagnosis'));
  const next={bed:normalizeBedCandidate(form.get('bed')),name:clean(form.get('name')),age:normalizeAge(form.get('age')),sex:normalizeSex(form.get('sex')),target,modality:normalizeModality(form.get('modality'),target),diagnosis,diagnosisMeaning:diagnosis?clean(form.get('diagnosisMeaning')):'',transport:portable?'No trasladar':(normalizeTransport(form.get('transport'))||'Por definir'),transportReason:clean(form.get('transportReason')),oxygenProbable,oxygenReason:oxygenProbable?clean(form.get('oxygenReason')):''};
  if(!next.bed&&!next.name&&!next.target){document.getElementById('bed')?.focus();return;}
  const candidate={id:editingId||uid(),shiftId:shift.id,...next},conflicts=findConflictsAgainstExisting(rows,[candidate],editingId);if(conflicts.length){setFormError(`La cama ${conflicts[0]} ya tiene otro paciente a piso en este turno. Revisa antes de guardar.`);return;}
  if(editingId)rows=rows.map((row)=>row.id===editingId?{...row,...next,shiftId:shift.id}:row);else rows.unshift({...candidate,createdAt:new Date().toISOString()});save();closeSheet();render();
}
function removeRow(id){const index=rows.findIndex((row)=>row.id===id);if(index<0)return;const [removed]=rows.splice(index,1);undoState={row:removed,index,expiresAt:Date.now()+UNDO_MS};save();render();if(undoTimer)clearTimeout(undoTimer);undoTimer=setTimeout(()=>{undoState=null;render();},UNDO_MS+50);}
function undoRemove(){if(!undoState||undoState.expiresAt<=Date.now()){undoState=null;render();return;}const conflicts=findConflictsAgainstExisting(rows,[undoState.row]);if(conflicts.length){undoState=null;render();setCaptureStatus(`No se pudo deshacer: la cama ${conflicts[0]} ya está ocupada en la lista.`,'error');return;}rows.splice(Math.min(undoState.index,rows.length),0,undoState.row);undoState=null;if(undoTimer)clearTimeout(undoTimer);save();render();setCaptureStatus('Paciente restaurado.','success');setTimeout(()=>setCaptureStatus(''),1800);}
function startNewShift(){if(typeof window==='undefined')return;if(rows.length&&!window.confirm(`Iniciar un turno nuevo archivará estos ${rows.length} pendientes y dejará la lista vacía. ¿Continuar?`))return;archiveShift(shift,rows);shift=newShiftMeta();rows=[];undoState=null;save();render();setCaptureStatus('Turno nuevo iniciado.','success');setTimeout(()=>setCaptureStatus(''),2200);}

if(root){render();if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/turno-rx/sw.js',{updateViaCache:'none'}).then((registration)=>registration.update()).catch(()=>{}));}

export {displayOrigin,canonicalOrigin,compareOrigins,parseFloorTarget,floorGroupKey,rowFloorGroupKey,hasFloorTarget,isCompleteFloorRow,isIncompleteFloorRow,findDuplicateFloorOrigins,findConflictsAgainstExisting,rowKey,findMatchingRowIndex,normalizeAge,ageFromBirthDate,normalizeStudyDisplay,normalizeModality,normalizeCategory,isRayXStudyText,reviewFields,patientDedupeKey,imageFingerprint,compareFloorRows,compareImagingRows,effectiveTransport,normalizeVisionRow,mergeRow,mergeStudyTargets,commitPhotoResult};
