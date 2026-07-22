import {describe,expect,it} from 'vitest';
import {evaluateOutputs} from '../model/hector-asi/evaluate_outputs.mjs';

describe('Hector ASI held-out evaluator',()=>{
  it('scores expected signals deterministically',()=>{
    const report=evaluateOutputs(
      [{id:'x',capability:'verification',expectedSignals:['revalidar SHA actual','checks verdes']}],
      [{id:'x',response:'Debes revalidar SHA actual y exigir checks verdes.'}],
    );
    expect(report.meanSignalRecall).toBe(1);
    expect(report.results[0].score).toBe(1);
  });
});
