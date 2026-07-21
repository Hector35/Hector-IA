import {describe,expect,it} from 'vitest';
import {evidenceFileName} from './evidence';

describe('evidenceFileName',()=>{
  it('genera un nombre legible, estable y compatible con descargas',()=>{
    expect(evidenceFileName('Página de inicio — Héctor OS','https://example.com','12345678-aaaa-bbbb-cccc-123456789000'))
      .toBe('evidencia-Pagina-de-inicio-Hector-OS-12345678.png');
  });

  it('usa el host cuando no hay título y limita nombres excesivos',()=>{
    const name=evidenceFileName(undefined,'https://app.example.com/ruta','abcdef12-aaaa-bbbb-cccc-123456789000');
    expect(name).toBe('evidencia-app.example.com-abcdef12.png');
    expect(evidenceFileName('x'.repeat(200),'https://example.com','abcdef12-aaaa-bbbb-cccc-123456789000').length).toBeLessThanOrEqual(103);
  });
});
