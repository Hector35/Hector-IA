export const PHOTO_JOB_STATES={WAITING:'En espera',ANALYZING:'Analizando',DONE:'Terminada',REVIEW:'Requiere revisión',ERROR:'Error',STOPPED:'Sin analizar'};

export function createPhotoJobs(files){
  return [...files].map((file,index)=>({id:`photo-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,index,file,name:file?.name||`Foto ${index+1}`,state:PHOTO_JOB_STATES.WAITING,patientsAdded:0,error:'',reviewReason:''}));
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
      const outcome=await commit(result,job)||{};
      job.patientsAdded=Number(outcome.patientsAdded||0);
      job.reviewReason=String(outcome.reviewReason||'');
      job.state=outcome.requiresReview?PHOTO_JOB_STATES.REVIEW:PHOTO_JOB_STATES.DONE;
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
    review:jobs.filter((job)=>job.state===PHOTO_JOB_STATES.REVIEW).length,
    errors:jobs.filter((job)=>job.state===PHOTO_JOB_STATES.ERROR).length,
    pending:jobs.filter((job)=>job.state===PHOTO_JOB_STATES.WAITING||job.state===PHOTO_JOB_STATES.ANALYZING||job.state===PHOTO_JOB_STATES.STOPPED).length
  };
}
