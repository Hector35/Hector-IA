import {test,expect} from 'vitest';
import {PHOTO_JOB_STATES,createPhotoJobs,runPhotoJobs,photoQueueSummary} from '../public/turno-rx/progressive-photo-queue-v45.js';
import {findMatchingRowIndex,mergeRow} from '../public/turno-rx/app-v16.js';

const files=(count)=>Array.from({length:count},(_,index)=>({name:`foto-${index+1}.jpg`}));

test('una fotografía se procesa y confirma inmediatamente',async()=>{
  const jobs=createPhotoJobs(files(1)),commits=[];
  await runPhotoJobs(jobs,{analyze:async()=>[{id:1}],commit:async(result,job)=>{commits.push(job.index);return {patientsAdded:result.length};}});
  expect(commits).toEqual([0]);expect(jobs[0].state).toBe(PHOTO_JOB_STATES.DONE);expect(photoQueueSummary(jobs).added).toBe(1);
});

test('cinco fotografías se confirman una por una antes de terminar el lote',async()=>{
  const jobs=createPhotoJobs(files(5)),snapshots=[];
  await runPhotoJobs(jobs,{analyze:async(_,job)=>[{id:job.index}],commit:async(_,job)=>{snapshots.push({committed:job.index,remaining:jobs.filter((item)=>item.state===PHOTO_JOB_STATES.WAITING).length});return {patientsAdded:1};}});
  expect(snapshots[0]).toEqual({committed:0,remaining:4});expect(snapshots.map((item)=>item.committed)).toEqual([0,1,2,3,4]);expect(photoQueueSummary(jobs)).toMatchObject({processed:5,added:5,errors:0});
});

test('un error intermedio no borra resultados ni detiene las fotos siguientes',async()=>{
  const jobs=createPhotoJobs(files(5)),commits=[];
  await runPhotoJobs(jobs,{analyze:async(_,job)=>{if(job.index===2)throw new Error('ilegible');return [job.index];},commit:async(_,job)=>{commits.push(job.index);return {patientsAdded:1};}});
  expect(commits).toEqual([0,1,3,4]);expect(jobs[2].state).toBe(PHOTO_JOB_STATES.ERROR);expect(photoQueueSummary(jobs)).toMatchObject({processed:5,added:4,errors:1});
});

test('se reintenta únicamente la fotografía fallida',async()=>{
  const jobs=createPhotoJobs(files(3)),attempts=[0,0,0];
  await runPhotoJobs(jobs,{analyze:async(_,job)=>{attempts[job.index]++;if(job.index===1)throw new Error('temporal');return [];},commit:async()=>({patientsAdded:0})});
  jobs[1].state=PHOTO_JOB_STATES.WAITING;
  await runPhotoJobs([jobs[1]],{analyze:async(_,job)=>{attempts[job.index]++;return [];},commit:async()=>({patientsAdded:0})});
  expect(attempts).toEqual([1,2,1]);expect(jobs[1].state).toBe(PHOTO_JOB_STATES.DONE);
});

test('detener conserva terminadas y marca pendientes sin analizar',async()=>{
  const jobs=createPhotoJobs(files(4));let stop=false;
  await runPhotoJobs(jobs,{analyze:async()=>[],commit:async()=>{stop=true;return {patientsAdded:1};},shouldStop:()=>stop});
  expect(jobs[0].state).toBe(PHOTO_JOB_STATES.DONE);expect(jobs.slice(1).every((job)=>job.state===PHOTO_JOB_STATES.STOPPED)).toBe(true);
});

test('una lectura ambigua queda en revisión y el lote continúa',async()=>{
  const jobs=createPhotoJobs(files(2));
  await runPhotoJobs(jobs,{analyze:async()=>[],commit:async(_,job)=>job.index===0?{requiresReview:true,reviewReason:'cama ambigua'}:{patientsAdded:2}});
  expect(jobs[0].state).toBe(PHOTO_JOB_STATES.REVIEW);expect(jobs[1].state).toBe(PHOTO_JOB_STATES.DONE);expect(photoQueueSummary(jobs)).toMatchObject({review:1,added:2});
});

test('deduplica variaciones pequeñas de OCR sin usar solamente cama, apellido o estudio',()=>{
  const existing=[{bed:'CE4',name:'MARIA HERNANDEZ',category:'Rayos X',target:'Tórax',transport:'Silla'}];
  expect(findMatchingRowIndex(existing,{bed:'CE4',name:'MARIA HERNANDE2',category:'Rayos X',target:'Abdomen'})).toBe(0);
  expect(findMatchingRowIndex(existing,{bed:'CE4',name:'JUAN HERNANDEZ',category:'Rayos X',target:'Tórax'})).toBe(-1);
  expect(findMatchingRowIndex(existing,{bed:'CE5',name:'MARIA HERNANDEZ',category:'Rayos X',target:'Tórax'})).toBe(-1);
});

test('combina varios estudios de la misma boleta sin duplicar al paciente',()=>{
  const merged=mergeRow({bed:'10',name:'ANA LOPEZ',category:'Rayos X',target:'Tórax',transport:'Silla'},{bed:'10',name:'ANA LOPEZ',category:'Rayos X',target:'Abdomen',transport:'Silla'});
  expect(merged.target).toBe('Tórax + Abdomen');
});
