import {describe,expect,it} from 'vitest';
import {decideMetacognitiveTrust,type MetacognitiveProfile} from './metacognitive-calibration';

const profile=(overrides:Partial<MetacognitiveProfile>={}):MetacognitiveProfile=>({sampleCount:12,accuracy:.86,meanConfidence:.82,brierScore:.12,calibrationGap:.04,overconfidence:0,preferDeep:false,requireVerification:false,reason:'calibrado',...overrides});

describe('metacognitive selective trust',()=>{
 it('permite caché y reutilización cuando la calibración y evidencia son sanas',()=>{
  expect(decideMetacognitiveTrust({profile:profile(),risk:'low',verificationOk:true,qualityAccepted:true,fallback:false})).toMatchObject({allowCacheRead:true,allowCacheWrite:true,allowDeterministicReuse:true,requiresReview:false,trusted:true});
 });
 it('bloquea automatización cuando el perfil exige verificación',()=>{
  expect(decideMetacognitiveTrust({profile:profile({requireVerification:true,reason:'gap alto'}),risk:'low',verificationOk:true,qualityAccepted:true,fallback:false})).toMatchObject({allowCacheRead:false,allowCacheWrite:false,allowDeterministicReuse:false,requiresReview:true,trusted:false});
 });
 it('no consolida resultados fallidos o con fallback',()=>{
  expect(decideMetacognitiveTrust({profile:profile(),risk:'low',verificationOk:false,qualityAccepted:true,fallback:false}).allowCacheWrite).toBe(false);
  expect(decideMetacognitiveTrust({profile:profile(),risk:'low',verificationOk:true,qualityAccepted:true,fallback:true}).trusted).toBe(false);
 });
 it('mantiene revisión en acciones de riesgo aunque la calibración sea buena',()=>{
  expect(decideMetacognitiveTrust({profile:profile(),risk:'high',verificationOk:true,qualityAccepted:true,fallback:false})).toMatchObject({allowCacheRead:false,allowDeterministicReuse:false,requiresReview:true});
 });
});