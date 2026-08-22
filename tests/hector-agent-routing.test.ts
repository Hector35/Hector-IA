import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('Héctor Agent routing and cache isolation',()=>{
 const entry=readFileSync('worker/secure-entry.ts','utf8');
 const rootSw=readFileSync('public/sw.js','utf8');
 const agentSw=readFileSync('public/agent/sw.js','utf8');

 it('routes both public entry points to the exact Hector Agent shell',()=>{
  expect(entry).toContain("url.pathname==='/hector-agent'");
  expect(entry).toContain("redirectUrl.pathname='/agent/index.html'");
  expect(entry).toContain("url.pathname==='/agent/'||url.pathname==='/agent/index.html'");
  expect(entry).toContain("assetUrl.pathname='/agent/index.html'");
  expect(entry).toContain("X-Hector-Agent-Version");
 });

 it('never lets the root service worker own Hector Agent navigations',()=>{
  expect(rootSw).toContain("'/agent'");
  expect(rootSw).toContain("'/hector-agent'");
  expect(rootSw).toContain("key.startsWith(CACHE_PREFIX)&&key!==CACHE");
  expect(rootSw).not.toContain("keys.filter(key=>key!==CACHE)");
 });

 it('keeps the Agent cache isolated and never precaches a potentially wrong shell',()=>{
  expect(agentSw).toContain("CACHE_PREFIX='hector-agent-'");
  expect(agentSw).toContain("key.startsWith(CACHE_PREFIX)&&key!==CACHE");
  expect(agentSw).not.toContain("keys.filter(k=>k!==CACHE)");
  expect(agentSw).not.toContain("const ASSETS=['./','./index.html'");
  expect(agentSw).toContain("if(req.mode==='navigate')");
  expect(agentSw).toContain("fetch(req,{cache:'no-store'})");
 });
});
