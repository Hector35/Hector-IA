export const PHOTO_JOB_STATES={WAITING:'En espera',ANALYZING:'Analizando',DONE:'Terminada',REVIEW:'Requiere revisión',ERROR:'Error',STOPPED:'Sin analizar'};

const STORAGE_KEY='pendientes-table-v2';
const clean=(value)=>String(value??'').trim();
const plain=(value)=>clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const isRealized=(row)=>plain(row?.status)==='realizado';
const isPending=(row)=>!isRealized(row);

function categoryKey(row){
  const explicit=plain(row?.category);
  if(explicit==='piso'||/subir a piso|traslado a piso/.test(explicit))return 'piso';
  if(explicit==='tac'||explicit==='tc'||explicit.includes('tomograf'))return 'tac';
  if(explicit==='usg'||explicit.includes('ultrason')||explicit.includes('ecograf'))return 'usg';
  if(explicit.includes('rayos')||explicit.includes('radiograf')||explicit==='rx')return 'rayos x';
  return explicit||plain(row?.modality)||'otro';
}

function canonicalOrigin(value){
  const text=clean(value).replace(/^C\/\s*(?=CE\s*\d+)/i,'').toUpperCase().replace(/\s+/g,'').replace(/#/g,'');
  if(!text||/SALADEESPERA/.test(text))return '';
  let match=text.match(/^CAMA0*(\d+)$/);if(match)return `N:${Number(match[1])}`;
  match=text.match(/^UA0*(\d+)$/);if(match)return `N:${Number(match[1])}`;
  match=text.match(/^C0*(\d+)$/);if(match)return `N:${Number(match[1])}`;
  match=text.match(/^0*(\d+)$/);if(match)return `N:${Number(match[1])}`;
  match=text.match(/^(CE|UP|UI)0*(\d+)$/);if(match)return `${match[1]}:${Number(match[2])}`;
  return text;
}

function normalizedName(value){return plain(value).replace(/\b(de|del|la|las|los)\b/g,' ').replace(/\s+/g,' ').trim();}
function canonicalName(value){return normalizedName(value).replace(/\s+/g,'');}
function normalizedStudy(value){return plain(value).replace(/\b(rx|rayos x|radiografia|radiografias|placa|ap|pa)\b/g,' ').replace(/\s+/g,' ').trim();}
function logicalKey(row){return [categoryKey(row),canonicalOrigin(row?.bed),normalizedName(row?.name),normalizedStudy(row?.destination||row?.target)].join('|');}
function oneEditApart(a,b){if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}return edits+(i<a.length||j<b.length?1:0)<=1;}
function sameFingerprintIdentity(existing,incoming){
  if(!incoming?.imageFingerprint||existing?.imageFingerprint!==incoming.imageFingerprint||categoryKey(existing)!==categoryKey(incoming))return false;
  const incomingBed=canonicalOrigin(incoming?.bed),existingBed=canonicalOrigin(existing?.bed);
  if(incomingBed&&existingBed===incomingBed)return true;
  const incomingName=normalizedName(incoming?.name),existingName=normalizedName(existing?.name);
  return Boolean(incomingName&&existingName&&(incomingName===existingName||incomingName.includes(existingName)||existingName.includes(incomingName)));
}
function wouldAppMatch(existing,incoming){
  if(sameFingerprintIdentity(existing,incoming))return true;
  if(logicalKey(existing)===logicalKey(incoming)&&logicalKey(incoming)!=='|||')return true;
  const origin=canonicalOrigin(incoming?.bed),incomingName=canonicalName(incoming?.name),existingName=canonicalName(existing?.name);
  return Boolean(origin&&incomingName.length>=6&&existingName.length>=6&&canonicalOrigin(existing?.bed)===origin&&categoryKey(existing)===categoryKey(incoming)&&oneEditApart(existingName,incomingName));
}
function normalizeTransport(value){
  const text=plain(value);
  if(text.includes('no traslad')||text.includes('portatil'))return 'No trasladar';
  if(text.includes('camilla'))return 'Camilla';
  if(text.includes('silla'))return 'Silla';
  if(text.includes('definir')||text.includes('pendiente'))return 'Por definir';
  return clean(value);
}
function mergeFloorPending(existing,incoming){
  const incomingTransport=normalizeTransport(incoming?.transport),existingTransport=normalizeTransport(existing?.transport);
  const manual=existing?.manualTransportOverride===true&&['Silla','Camilla','Por definir'].includes(existingTransport);
  const target=clean(incoming?.target)||clean(incoming?.destination)||clean(existing?.target)||clean(existing?.destination);
  const portable=/port[áa]til/i.test(target);
  return {
    ...existing,
    bed:clean(incoming?.bed)||clean(existing?.bed),
    name:clean(incoming?.name)||clean(existing?.name),
    age:incoming?.age??existing?.age??null,
    sex:clean(incoming?.sex)&&plain(incoming?.sex)!=='no visible'?incoming.sex:(clean(existing?.sex)||clean(incoming?.sex)||'No visible'),
    category:'Piso',
    target,
    destination:clean(incoming?.destination)||clean(incoming?.target)||clean(existing?.destination)||clean(existing?.target),
    destinationFloor:clean(incoming?.destinationFloor)||clean(existing?.destinationFloor),
    destinationBlock:clean(incoming?.destinationBlock)||clean(existing?.destinationBlock),
    service:clean(incoming?.service)||clean(existing?.service),
    originService:clean(incoming?.originService)||clean(existing?.originService),
    transferNotes:clean(incoming?.transferNotes)||clean(existing?.transferNotes),
    recognizedText:clean(incoming?.recognizedText)||clean(existing?.recognizedText),
    confidence:{...(existing?.confidence||{}),...(incoming?.confidence||{})},
    needsReview:Boolean(existing?.needsReview||incoming?.needsReview),
    reviewFields:[...new Set([...(existing?.reviewFields||[]),...(incoming?.reviewFields||[])])],
    imageFingerprint:clean(incoming?.imageFingerprint)||clean(existing?.imageFingerprint),
    transport:portable?'No trasladar':manual?existingTransport:(incomingTransport&&incomingTransport!=='Por definir'?incomingTransport:(existingTransport||incomingTransport||'Por definir')),
    transportReason:manual?clean(existing?.transportReason):(clean(incoming?.transportReason)||clean(existing?.transportReason)),
    oxygenProbable:Boolean(existing?.oxygenProbable||incoming?.oxygenProbable),
    oxygenReason:clean(incoming?.oxygenReason)||clean(existing?.oxygenReason),
    status:clean(existing?.status)||'Pendiente'
  };
}
function reviewRow(message,source={}){
  return {...source,id:source?.id||`review-${Date.now()}-${Math.random().toString(16).slice(2)}`,category:'Piso',bed:'',handwrittenBed:'',formBed:'',captureReviewOnly:true,needsReview:true,reviewFields:[...new Set([...(source?.reviewFields||[]),'bed'])],transferNotes:[clean(source?.transferNotes),message].filter(Boolean).join(' · '),recognizedText:[clean(source?.recognizedText),message].filter(Boolean).join(' · ')};
}

export function planPhotoReconciliation(existingRows,analyzed){
  const current=Array.isArray(existingRows)?existingRows.map((row)=>({...row})):[];
  const valid=Array.isArray(analyzed)?analyzed:[...(analyzed?.valid||[])];
  const review=Array.isArray(analyzed)?[]:[...(analyzed?.review||[])];
  const pass=[],generatedReview=[];
  const metrics={directAdded:0,updated:0,duplicates:0,review:0};
  let storageChanged=false;

  const floorCounts=new Map();
  for(const row of valid){if(categoryKey(row)!=='piso')continue;const origin=canonicalOrigin(row?.bed);if(origin)floorCounts.set(origin,(floorCounts.get(origin)||0)+1);}
  const handledAmbiguous=new Set();

  for(const incoming of valid){
    const category=categoryKey(incoming),origin=canonicalOrigin(incoming?.bed);
    if(category==='piso'&&origin&&(floorCounts.get(origin)||0)>1){
      metrics.review+=1;
      if(!handledAmbiguous.has(origin)){
        generatedReview.push(reviewRow(`Origen duplicado en la misma fotografía: ${origin.replace(/^N:/,'')}. Revisa ese renglón; los demás sí se procesaron.`,incoming));
        handledAmbiguous.add(origin);
      }
      continue;
    }

    const exactDuplicate=current.find((row)=>sameFingerprintIdentity(row,incoming));
    if(exactDuplicate){metrics.duplicates+=1;continue;}

    if(category==='piso'&&origin){
      const pendingMatches=current.filter((row)=>categoryKey(row)==='piso'&&isPending(row)&&canonicalOrigin(row?.bed)===origin&&!row?.captureReviewOnly);
      if(pendingMatches.length>1){
        metrics.review+=1;
        generatedReview.push(reviewRow(`Hay más de un pendiente activo para el origen ${origin.replace(/^N:/,'')}. Revisa solo esa cama; el resto de la foto sí se procesó.`,incoming));
        continue;
      }
      if(pendingMatches.length===1){
        const index=current.indexOf(pendingMatches[0]);
        current[index]=mergeFloorPending(pendingMatches[0],incoming);
        metrics.updated+=1;storageChanged=true;continue;
      }
      const realizedSameOrigin=current.some((row)=>categoryKey(row)==='piso'&&isRealized(row)&&canonicalOrigin(row?.bed)===origin&&!row?.captureReviewOnly);
      if(realizedSameOrigin){
        current.unshift({...incoming,status:'Pendiente'});
        metrics.directAdded+=1;storageChanged=true;continue;
      }
      pass.push(incoming);continue;
    }

    const realizedWouldMatch=current.find((row)=>isRealized(row)&&wouldAppMatch(row,incoming));
    if(realizedWouldMatch){
      current.unshift({...incoming,status:'Pendiente'});
      metrics.directAdded+=1;storageChanged=true;continue;
    }

    pass.push(incoming);
  }

  return {nextRows:current,commitResult:{valid:pass,review:[...review,...generatedReview]},metrics,storageChanged};
}

function readStoredRows(){
  if(typeof localStorage==='undefined')return null;
  try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(parsed)?parsed:[];}catch{return [];}
}
function applyReconciliation(analyzed){
  const stored=readStoredRows();
  if(stored===null)return {commitResult:analyzed,metrics:{directAdded:0,updated:0,duplicates:0,review:0}};
  const plan=planPhotoReconciliation(stored,analyzed);
  if(plan.storageChanged){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(plan.nextRows));
    if(typeof document!=='undefined')document.dispatchEvent(new CustomEvent('pendientes:status-changed',{detail:{source:'photo-reconciliation-v63',...plan.metrics}}));
  }
  return plan;
}

export function createPhotoJobs(files){
  return [...files].map((file,index)=>({id:`photo-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,index,file,name:file?.name||`Foto ${index+1}`,state:PHOTO_JOB_STATES.WAITING,patientsAdded:0,patientsUpdated:0,duplicatesSkipped:0,error:'',reviewReason:''}));
}

export async function runPhotoJobs(jobs,{analyze,commit,onUpdate=()=>{},shouldStop=()=>false}={}){
  for(const job of jobs){
    if(shouldStop()){
      if(job.state===PHOTO_JOB_STATES.WAITING)job.state=PHOTO_JOB_STATES.STOPPED;
      onUpdate(job,jobs);
      continue;
    }
    if(job.state!==PHOTO_JOB_STATES.WAITING&&job.state!==PHOTO_JOB_STATES.ERROR)continue;
    job.state=PHOTO_JOB_STATES.ANALYZING;job.error='';job.reviewReason='';onUpdate(job,jobs);
    try{
      const result=await analyze(job.file,job);
      const prepared=applyReconciliation(result);
      const outcome=await commit(prepared.commitResult,job)||{};
      job.patientsAdded=Number(outcome.patientsAdded||0)+Number(prepared.metrics?.directAdded||0);
      job.patientsUpdated=Number(prepared.metrics?.updated||0);
      job.duplicatesSkipped=Number(prepared.metrics?.duplicates||0);
      const reviewCount=Number(prepared.metrics?.review||0);
      const reasons=[];
      if(outcome.reviewReason)reasons.push(String(outcome.reviewReason));
      if(reviewCount)reasons.push(`${reviewCount} ${reviewCount===1?'renglón se aisló':'renglones se aislaron'} para revisión sin bloquear la fotografía.`);
      job.reviewReason=reasons.join(' ');
      job.state=outcome.requiresReview||reviewCount?PHOTO_JOB_STATES.REVIEW:PHOTO_JOB_STATES.DONE;
    }catch(error){
      job.state=PHOTO_JOB_STATES.ERROR;
      job.error=error instanceof Error?error.message:'No se pudo leer esta fotografía.';
    }
    onUpdate(job,jobs);
  }
  return jobs;
}

export function photoQueueSummary(jobs){
  const terminal=new Set([PHOTO_JOB_STATES.DONE,PHOTO_JOB_STATES.REVIEW,PHOTO_JOB_STATES.ERROR]);
  return {
    total:jobs.length,
    processed:jobs.filter((job)=>terminal.has(job.state)).length,
    added:jobs.reduce((sum,job)=>sum+Number(job.patientsAdded||0),0),
    updated:jobs.reduce((sum,job)=>sum+Number(job.patientsUpdated||0),0),
    duplicates:jobs.reduce((sum,job)=>sum+Number(job.duplicatesSkipped||0),0),
    review:jobs.filter((job)=>job.state===PHOTO_JOB_STATES.REVIEW).length,
    errors:jobs.filter((job)=>job.state===PHOTO_JOB_STATES.ERROR).length,
    pending:jobs.filter((job)=>job.state===PHOTO_JOB_STATES.WAITING||job.state===PHOTO_JOB_STATES.ANALYZING||job.state===PHOTO_JOB_STATES.STOPPED).length
  };
}
