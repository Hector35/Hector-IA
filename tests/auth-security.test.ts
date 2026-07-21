import {describe,expect,it} from 'vitest';
import {rateLimitDecision} from '../worker/lib/auth-rate-limit';

describe('auth rate limiting',()=>{
 const now=Date.parse('2026-07-21T12:00:00.000Z');
 it('permite una identidad sin historial',()=>{
  expect(rateLimitDecision(null,now)).toEqual({blocked:false,failures:0});
 });
 it('conserva fallos dentro de la ventana',()=>{
  expect(rateLimitDecision({failures:3,window_started_at:'2026-07-21T11:55:00.000Z'},now)).toEqual({blocked:false,failures:3});
 });
 it('reinicia fallos fuera de la ventana',()=>{
  expect(rateLimitDecision({failures:4,window_started_at:'2026-07-21T11:40:00.000Z'},now)).toEqual({blocked:false,failures:0});
 });
 it('bloquea hasta la fecha indicada y calcula Retry-After',()=>{
  expect(rateLimitDecision({failures:5,window_started_at:'2026-07-21T11:58:00.000Z',blocked_until:'2026-07-21T12:10:00.000Z'},now)).toEqual({blocked:true,failures:5,retryAfterSeconds:600});
 });
 it('libera un bloqueo vencido',()=>{
  expect(rateLimitDecision({failures:5,window_started_at:'2026-07-21T11:30:00.000Z',blocked_until:'2026-07-21T11:59:00.000Z'},now)).toEqual({blocked:false,failures:0});
 });
});
