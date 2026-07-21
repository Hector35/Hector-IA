import {describe,expect,it} from 'vitest';
import {browserVerificationError,canTransitionBrowserVerification,resolveBrowserVerificationOutcome} from './browser-verification';

describe('browser verification lifecycle',()=>{
 it('permite el ciclo normal y fallos desde estados activos',()=>{
  expect(canTransitionBrowserVerification('queued','running')).toBe(true);
  expect(canTransitionBrowserVerification('running','completed')).toBe(true);
  expect(canTransitionBrowserVerification('queued','failed')).toBe(true);
  expect(canTransitionBrowserVerification('running','failed')).toBe(true);
 });

 it('mantiene estados terminales inmutables e idempotentes',()=>{
  expect(canTransitionBrowserVerification('completed','completed')).toBe(true);
  expect(canTransitionBrowserVerification('failed','failed')).toBe(true);
  expect(canTransitionBrowserVerification('completed','failed')).toBe(false);
  expect(canTransitionBrowserVerification('failed','completed')).toBe(false);
 });

 it('resuelve el resultado por estado HTTP o por resultado explícito',()=>{
  expect(resolveBrowserVerificationOutcome(200)).toBe('completed');
  expect(resolveBrowserVerificationOutcome(399)).toBe('completed');
  expect(resolveBrowserVerificationOutcome(404)).toBe('failed');
  expect(resolveBrowserVerificationOutcome(null)).toBe('failed');
  expect(resolveBrowserVerificationOutcome(200,'failed')).toBe('failed');
 });

 it('conserva solo un error breve y útil',()=>{
  expect(browserVerificationError([' ','No se pudo navegar','otro'])).toBe('No se pudo navegar');
  expect(browserVerificationError([])).toBeNull();
  expect(browserVerificationError(['x'.repeat(800)])).toHaveLength(500);
 });
});
