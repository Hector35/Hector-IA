import {describe,expect,it} from 'vitest';
import {SECURITY_BOUNDARY_MANIFEST,evaluateSecurityBoundary,isProtectedMutation,normalizeRequestId} from './security-boundary';

describe('API security boundary',()=>{
 it('allows safe reads and same-origin mutations',()=>{
  expect(evaluateSecurityBoundary({url:'https://hector.example/api/system/quality',method:'GET',origin:'https://evil.example',secFetchSite:'cross-site'}).reason).toBe('safe-method');
  expect(evaluateSecurityBoundary({url:'https://hector.example/api/memories',method:'POST',origin:'https://hector.example',secFetchSite:'same-origin'})).toMatchObject({allowed:true,reason:'same-origin'});
 });

 it('blocks cross-origin and cross-site writes before route execution',()=>{
  expect(evaluateSecurityBoundary({url:'https://hector.example/api/memories',method:'POST',origin:'https://evil.example',secFetchSite:'cross-site'})).toMatchObject({allowed:false,reason:'cross-site'});
  expect(evaluateSecurityBoundary({url:'https://hector.example/api/memories',method:'DELETE',origin:'https://evil.example',secFetchSite:'same-site'})).toMatchObject({allowed:false,reason:'cross-origin'});
  expect(evaluateSecurityBoundary({url:'https://hector.example/api/memories',method:'PATCH',origin:'not a url'})).toMatchObject({allowed:false,reason:'cross-origin'});
 });

 it('allows authenticated server clients without browser origin headers',()=>{
  expect(evaluateSecurityBoundary({url:'https://hector.example/control/v1/jobs',method:'POST'})).toMatchObject({allowed:true,reason:'server-client'});
 });

 it('applies only to protected mutation surfaces and normalizes request IDs',()=>{
  expect(isProtectedMutation('/api/memories','POST')).toBe(true);
  expect(isProtectedMutation('/health','POST')).toBe(false);
  expect(isProtectedMutation('/api/memories','GET')).toBe(false);
  expect(normalizeRequestId('trace-12345678')).toBe('trace-12345678');
  expect(normalizeRequestId('bad id')).toMatch(/^[a-f0-9-]{36}$/);
  expect(SECURITY_BOUNDARY_MANIFEST).toMatchObject({crossSiteMutations:'deny',sameOriginMutations:'allow',serverClientsWithoutOrigin:'allow',apiCache:'no-store',frameEmbedding:'deny',requestId:true});
 });
});
