import {describe,expect,it} from 'vitest';
import {ageFromVision} from '../src/PatientShiftApp';

describe('ageFromVision',()=>{
  it('does not turn a missing age into zero',()=>{
    expect(ageFromVision({age:null,birthDate:null})).toBeNull();
    expect(ageFromVision({age:'',birthDate:null})).toBeNull();
  });

  it('keeps a valid visible age',()=>{
    expect(ageFromVision({age:63,birthDate:null})).toBe(63);
    expect(ageFromVision({age:'18',birthDate:null})).toBe(18);
  });

  it('falls back to a valid birth date when age is missing',()=>{
    const birthDate='2000-01-01';
    const today=new Date();
    const expected=today.getFullYear()-2000;
    expect(ageFromVision({age:null,birthDate})).toBe(expected);
  });

  it('rejects impossible ages',()=>{
    expect(ageFromVision({age:180,birthDate:null})).toBeNull();
    expect(ageFromVision({age:-2,birthDate:null})).toBeNull();
  });
});
