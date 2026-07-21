import {describe,expect,it} from 'vitest';
import {aggregateForecastAccuracy,extractForecastAccuracySample} from './forecast-accuracy';

const row=(forecast:number,actual:number,model='gpt-5.6-terra')=>({model,estimated_cost_usd:actual,metadata_json:JSON.stringify({budgetDecision:{projection:{estimatedCostUsd:forecast,model,tier:'balanced',passes:1}}})});

describe('forecast accuracy',()=>{
 it('extrae una muestra sin guardar contenido',()=>{const sample=extractForecastAccuracySample(row(.02,.025));expect(sample?.ratio).toBeCloseTo(1.25);expect(sample?.absolutePercentError).toBeCloseTo(20);});
 it('ignora filas inválidas o sin proyección',()=>{expect(extractForecastAccuracySample({estimated_cost_usd:.1,metadata_json:'{}'})).toBeNull();expect(extractForecastAccuracySample({estimated_cost_usd:0,metadata_json:'{}'})).toBeNull();});
 it('no calibra con menos de cinco muestras',()=>{const out=aggregateForecastAccuracy([row(.01,.02),row(.01,.02)]);expect(out.calibrationReady).toBe(false);expect(out.recommendedMultiplier).toBe(1);});
 it('recomienda la mediana robusta con suficientes muestras',()=>{const out=aggregateForecastAccuracy([row(.01,.02),row(.01,.02),row(.01,.02),row(.01,.02),row(.01,.5)]);expect(out.calibrationReady).toBe(true);expect(out.medianRatio).toBeCloseTo(2);expect(out.recommendedMultiplier).toBe(2);});
 it('agrupa por modelo',()=>{const out=aggregateForecastAccuracy([row(.01,.01,'luna'),row(.01,.02,'terra')]);expect(out.byModel.map(x=>x.model)).toEqual(['luna','terra']);});
});
