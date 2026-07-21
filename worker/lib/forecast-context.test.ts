import {describe,expect,it} from 'vitest';
import {combineForecastContextChars} from './forecast-context';

describe('combineForecastContextChars',()=>{
 it('suma prompt auxiliar, historial, resumen, sistema, memoria y proyectos',()=>{
  expect(combineForecastContextChars(100,{recent_chars:200,summary_chars:50,system_chars:400,memory_chars:300,project_chars:25})).toBe(1075);
 });
 it('ignora valores corruptos o negativos',()=>{
  expect(combineForecastContextChars(Number.NaN,{recent_chars:-10,summary_chars:Number.POSITIVE_INFINITY,system_chars:25,memory_chars:null,project_chars:undefined})).toBe(25);
 });
 it('limita el contexto para mantener la proyección acotada',()=>{
  expect(combineForecastContextChars(400000,{recent_chars:300000},500000)).toBe(500000);
  expect(combineForecastContextChars(100,{recent_chars:100},0)).toBe(0);
 });
});
