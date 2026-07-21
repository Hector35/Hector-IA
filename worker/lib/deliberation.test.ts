import {describe,expect,it} from 'vitest';
import {aggregateUsage,candidateInstructions,chooseDeliberation,judgeInput,judgeInstructions} from './deliberation';

describe('adaptive deliberation policy',()=>{
 it('uses an ensemble for deep tasks',()=>{
  expect(chooseDeliberation('Diseña una arquitectura completa','deep').mode).toBe('ensemble');
 });

 it('keeps simple requests on a single pass',()=>{
  const profile=chooseDeliberation('Hola, gracias','fast');
  expect(profile.mode).toBe('single');
  expect(profile.candidateCount).toBe(1);
 });

 it('raises sensitive complex tasks to ensemble mode',()=>{
  const profile=chooseDeliberation('Compara escenarios financieros, riesgos y sensibilidad antes de recomendar una inversión.','balanced');
  expect(profile.mode).toBe('ensemble');
  expect(profile.highStakes).toBe(true);
 });

 it('honors explicit high reasoning and configuration off',()=>{
  expect(chooseDeliberation('Explica esto','balanced',{reasoning:'high'}).mode).toBe('ensemble');
  expect(chooseDeliberation('Audita a fondo esta arquitectura','deep',{},false).mode).toBe('single');
  expect(chooseDeliberation('Audita a fondo esta arquitectura','deep',{deliberation:'off'}).mode).toBe('single');
 });

 it('builds independent roles and a private synthesis contract',()=>{
  const architect=candidateInstructions('BASE','architect','ingeniería',false);
  const adversary=candidateInstructions('BASE','adversary','ingeniería',true);
  const judge=judgeInstructions('BASE','ingeniería',true);
  expect(architect).toContain('arquitecto principal');
  expect(adversary).toContain('adversarial independiente');
  expect(adversary).toContain('tarea sensible');
  expect(judge).toContain('una sola respuesta final autosuficiente');
  expect(judge).toContain('No menciones candidatos');
 });

 it('assembles judge input and bounds candidate size',()=>{
  const text=judgeInput('Objetivo original',[
   {role:'architect',text:'A'.repeat(30000)},
   {role:'adversary',text:'Solución B'}
  ]);
  expect(text).toContain('SOLICITUD ORIGINAL');
  expect(text).toContain('SOLUCIÓN 1 — ARCHITECT');
  expect(text).toContain('SOLUCIÓN 2 — ADVERSARY');
  expect(text.length).toBeLessThan(26000);
 });

 it('aggregates usage from all passes',()=>{
  expect(aggregateUsage([
   {input_tokens:100,output_tokens:40,input_tokens_details:{cached_tokens:10}},
   {input_tokens:80,output_tokens:30,input_tokens_details:{cached_tokens:5}},
   undefined
  ])).toEqual({input_tokens:180,output_tokens:70,input_tokens_details:{cached_tokens:15}});
 });
});
