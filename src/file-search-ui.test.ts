import {describe,expect,it} from 'vitest';
import {matchesFileName} from './file-search-ui';

describe('matchesFileName',()=>{
 it('encuentra por fragmento sin distinguir mayúsculas ni acentos',()=>{
  expect(matchesFileName('Acreditación académica.pdf','acreditacion')).toBe(true);
  expect(matchesFileName('Reporte JULIO.xlsx','julio')).toBe(true);
 });
 it('oculta nombres no relacionados y muestra todo con consulta vacía',()=>{
  expect(matchesFileName('evidencia.png','nomina')).toBe(false);
  expect(matchesFileName('evidencia.png','')).toBe(true);
 });
});
