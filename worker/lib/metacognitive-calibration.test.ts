import {describe,expect,it} from 'vitest';
import {applyMetacognitiveRouting,calibrationBenchmark,normalizeConfidence,summarizeMetacognitiveCalibration} from './metacognitive-calibration';
const route={model:'fast-model',tier:'fast' as const,reason:'ruta barata',reasoning:'low' as const,task:'consulta general',needsWeb:false};

describe('metacognitive calibration',()=>{
 it('normaliza scores porcentuales y probabilísticos',()=>{expect(normalizeConfidence(85)).toBe(.85);expect(normalizeConfidence(.7)).toBe(.7);expect(normalizeConfidence(140)).toBe(1);});
 it('no escala con pocas muestras',()=>{const profile=summarizeMetacognitiveCalibration([{predicted_confidence:.99,correct:0,route_tier:'fast',provider:'cloudflare'}]);expect(profile.preferDeep).toBe(false);});
 it('detecta sobreconfianza repetida y escala conservadoramente',()=>{const profile=summarizeMetacognitiveCalibration(Array.from({length:10},()=>({predicted_confidence:.95,correct:0,route_tier:'fast',provider:'cloudflare'}))),adapted=applyMetacognitiveRouting(route,profile);expect(profile).toMatchObject({preferDeep:true,requireVerification:true});expect(adapted).toMatchObject({tier:'deep',reasoning:'high'});});
 it('preserva una ruta calibrada',()=>{const rows=Array.from({length:10},(_,index)=>({predicted_confidence:index<8?.8:.2,correct:index<8?1:0,route_tier:'fast',provider:'cloudflare'})),profile=summarizeMetacognitiveCalibration(rows),adapted=applyMetacognitiveRouting(route,profile);expect(profile.preferDeep).toBe(false);expect(adapted.tier).toBe('fast');});
 it('benchmark separa calibración sana de regresión',()=>{expect(calibrationBenchmark()).toMatchObject({calibratedPreferDeep:false,overconfidentPreferDeep:true});});
});