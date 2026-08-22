import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('public/bridge-core.html');
const js=read('public/bridge-core.js');

describe('Héctor Bridge Core console',()=>{
 it('exposes memory, jobs, tools and PWA inspection controls',()=>{
  for(const id of ['memoryQuery','memoryContent','jobObjective','pwaUrl','listTools'])expect(html).toContain(`id="${id}"`);
  expect(html).toContain('/bridge-core.js');
 });
 it('uses only the authenticated same-origin Bridge API',()=>{
  expect(js).toContain("fetch(`/api/hector-bridge${path}`");
  expect(js).toContain("credentials:'same-origin'");
  expect(js).toContain("api('/memory/search'");
  expect(js).toContain("api('/memory/write'");
  expect(js).toContain("api('/jobs/create'");
  expect(js).toContain("name:'pwa.inspect'");
  expect(()=>new Function(js)).not.toThrow();
 });
});