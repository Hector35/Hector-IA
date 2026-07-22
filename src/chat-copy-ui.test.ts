import {describe,expect,it} from 'vitest';
import {cleanCopiedAnswer} from './chat-copy-ui';

describe('cleanCopiedAnswer',()=>{
 it('recorta extremos y reduce saltos excesivos',()=>{
  expect(cleanCopiedAnswer('  Respuesta\n\n\n\nDetalle  ')).toBe('Respuesta\n\nDetalle');
 });
 it('conserva párrafos y contenido útil',()=>{
  expect(cleanCopiedAnswer('Título\n\n- Uno\n- Dos')).toBe('Título\n\n- Uno\n- Dos');
 });
});
