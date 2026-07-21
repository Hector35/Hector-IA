import {describe,expect,it} from 'vitest';
import {TEST_ACCOUNT_EMAIL,canProvisionTestAccount,classifyAccountRole,isPersistentTestAccount} from './test-account';

describe('persistent ChatGPT test account policy',()=>{
 it('recognizes the registered owner before any email classification',()=>{
  expect(classifyAccountRole('owner-1','owner@example.com','owner-1')).toBe('owner');
 });
 it('recognizes only the reserved technical account email as test',()=>{
  expect(classifyAccountRole('test-1',TEST_ACCOUNT_EMAIL,'owner-1')).toBe('test');
  expect(isPersistentTestAccount(TEST_ACCOUNT_EMAIL.toUpperCase())).toBe(true);
  expect(isPersistentTestAccount('other@example.com')).toBe(false);
 });
 it('allows only the owner to provision or enter the test identity',()=>{
  expect(canProvisionTestAccount('owner')).toBe(true);
  expect(canProvisionTestAccount('test')).toBe(false);
  expect(canProvisionTestAccount('other')).toBe(false);
 });
});
