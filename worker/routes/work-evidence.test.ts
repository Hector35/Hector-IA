import {describe,expect,it} from 'vitest';
import {normalizeVerificationTarget,parseEvidenceErrors} from './work-evidence';

describe('parseEvidenceErrors',()=>{
 it('acepta únicamente listas de cadenas',()=>{
  expect(parseEvidenceErrors('["console error","page error"]')).toEqual(['console error','page error']);
  expect(parseEvidenceErrors('["válido",42,null]')).toEqual(['válido']);
 });

 it('tolera contenido vacío o corrupto sin romper Trabajo',()=>{
  expect(parseEvidenceErrors(null)).toEqual([]);
  expect(parseEvidenceErrors('no-json')).toEqual([]);
  expect(parseEvidenceErrors('{"error":"x"}')).toEqual([]);
 });

 it('limita el volumen entregado a la interfaz',()=>{
  expect(parseEvidenceErrors(JSON.stringify(Array.from({length:150},(_,i)=>`e${i}`)))).toHaveLength(100);
 });
});

describe('normalizeVerificationTarget',()=>{
 it('normaliza una URL HTTPS pública y aplica el viewport de iPhone',()=>{
  expect(normalizeVerificationTarget({url:' https://hector-os.hectorhdzr035.workers.dev/trabajo#detalle '})).toEqual({
   url:'https://hector-os.hectorhdzr035.workers.dev/trabajo',
   viewport:'390x844'
  });
 });

 it('acepta viewports explícitos dentro del rango seguro',()=>{
  expect(normalizeVerificationTarget({url:'https://example.com',viewport:'430x932'})).toEqual({url:'https://example.com/',viewport:'430x932'});
 });

 it('rechaza protocolos inseguros, credenciales y destinos privados',()=>{
  expect(normalizeVerificationTarget({url:'http://example.com'})).toBeNull();
  expect(normalizeVerificationTarget({url:'https://user:secret@example.com'})).toBeNull();
  expect(normalizeVerificationTarget({url:'https://localhost'})).toBeNull();
  expect(normalizeVerificationTarget({url:'https://127.0.0.1'})).toBeNull();
  expect(normalizeVerificationTarget({url:'https://192.168.1.2'})).toBeNull();
  expect(normalizeVerificationTarget({url:'https://[::1]'})).toBeNull();
 });

 it('rechaza viewports inválidos o excesivos',()=>{
  expect(normalizeVerificationTarget({url:'https://example.com',viewport:'phone'})).toBeNull();
  expect(normalizeVerificationTarget({url:'https://example.com',viewport:'200x400'})).toBeNull();
  expect(normalizeVerificationTarget({url:'https://example.com',viewport:'4000x4000'})).toBeNull();
 });
});