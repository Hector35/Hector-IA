import {describe,expect,it} from 'vitest';
import {canRetry,retryDelaySeconds} from '../worker/lib/job-reliability';

describe('job reliability',()=>{
 it('aplica backoff exponencial con límite',()=>{
  expect(retryDelaySeconds(1)).toBe(30);
  expect(retryDelaySeconds(2)).toBe(60);
  expect(retryDelaySeconds(5)).toBe(480);
  expect(retryDelaySeconds(20)).toBe(3600);
 });
 it('normaliza intentos inválidos',()=>{
  expect(retryDelaySeconds(0)).toBe(30);
  expect(retryDelaySeconds(-4)).toBe(30);
 });
 it('permite reintentar solo antes del máximo',()=>{
  expect(canRetry(1,3)).toBe(true);
  expect(canRetry(2,3)).toBe(true);
  expect(canRetry(3,3)).toBe(false);
  expect(canRetry(8,3)).toBe(false);
 });
});
