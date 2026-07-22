import {describe,expect,it} from 'vitest';
import {validateHectorAsiArtifacts} from '../model/hector-asi/validate.mjs';

describe('Hector ASI model foundation',()=>{
  it('keeps training data verified, licensed, private-data free and separated from held-out evaluation',()=>{
    expect(validateHectorAsiArtifacts()).toEqual({
      candidate:'hector-asi-v0.1-qwen3-4b-sft',
      trainExamples:6,
      heldOutExamples:6,
    });
  });
});
