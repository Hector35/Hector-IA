import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=readFileSync('src/response-audit-ui.ts','utf8');

describe('auditoría visible del plan cognitivo',()=>{
 it('muestra estados de cumplimiento sin exponer razonamiento privado',()=>{
  expect(source).toContain('Plan cognitivo aprobado');
  expect(source).toContain('Plan exacto');
  expect(source).toContain('Fallback autorizado');
  expect(source).toContain('Desviación bloqueada');
  expect(source).toContain('Planes verificados');
  expect(source).not.toMatch(/chain.?of.?thought|cadena de pensamiento/i);
 });
});
