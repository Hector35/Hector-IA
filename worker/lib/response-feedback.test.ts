import {describe,expect,it} from 'vitest';
import {summarizeUserFeedback,type FeedbackRow} from './response-feedback';

const row=(rating:number,provider='openai',model_tier='balanced',reason:FeedbackRow['reason']=null):FeedbackRow=>({rating,provider,model_tier,reason});

describe('summarizeUserFeedback',()=>{
 it('mantiene el router estable sin evidencia suficiente',()=>{
  const profile=summarizeUserFeedback([row(-1),row(-1),row(1)]);
  expect(profile.preferDeep).toBe(false);
  expect(profile.avoidCloudflare).toBe(false);
 });

 it('escala a razonamiento profundo tras fallos repetidos no profundos',()=>{
  const profile=summarizeUserFeedback([row(-1),row(-1),row(-1),row(-1),row(1)]);
  expect(profile.nonDeepSampleCount).toBe(5);
  expect(profile.preferDeep).toBe(true);
  expect(profile.reason).toMatch(/razonamiento no profundo/);
 });

 it('evita Workers AI cuando su utilidad cae de forma repetida',()=>{
  const profile=summarizeUserFeedback([
   row(-1,'cloudflare','fast'),row(-1,'cloudflare','fast'),row(-1,'cloudflare','fast'),row(1,'cloudflare','fast')
  ]);
  expect(profile.avoidCloudflare).toBe(true);
  expect(profile.cloudflareSampleCount).toBe(4);
 });

 it('convierte razones repetidas en instrucciones personalizadas',()=>{
  const profile=summarizeUserFeedback([
   row(-1,'openai','balanced','not_personalized'),row(-1,'openai','balanced','not_personalized'),
   row(-1,'openai','balanced','too_short'),row(-1,'openai','balanced','too_short'),
   row(-1,'openai','balanced','incorrect')
  ]);
  expect(profile.guidance.join(' ')).toMatch(/contexto personal/);
  expect(profile.guidance.join(' ')).toMatch(/detalle técnico/);
  expect(profile.guidance.join(' ')).toMatch(/Verifica cálculos/);
 });

 it('no emite instrucciones contradictorias de longitud',()=>{
  const profile=summarizeUserFeedback([
   row(-1,'openai','balanced','too_long'),row(-1,'openai','balanced','too_long'),row(-1,'openai','balanced','too_short')
  ]);
  expect(profile.guidance.join(' ')).toMatch(/más compacta/);
  expect(profile.guidance.join(' ')).not.toMatch(/Aumenta el detalle/);
 });
});
