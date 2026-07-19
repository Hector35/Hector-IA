import {describe,expect,it} from 'vitest';
import {cosineSimilarity} from './context';

describe('cosineSimilarity',()=>{
  it('identifica vectores equivalentes y opuestos',()=>{
    expect(cosineSimilarity([1,0],[1,0])).toBeCloseTo(1);
    expect(cosineSimilarity([1,0],[-1,0])).toBeCloseTo(-1);
  });
  it('rechaza dimensiones incompatibles',()=>{
    expect(cosineSimilarity([1,0],[1])).toBe(0);
  });
});
