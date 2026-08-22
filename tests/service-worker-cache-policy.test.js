import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,expect,it,vi} from 'vitest';

const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

function worker(responseHeaders={}){
 const listeners={};
 const cache={addAll:vi.fn(async()=>{}),put:vi.fn(async()=>{})};
 const caches={
  open:vi.fn(async()=>cache),
  keys:vi.fn(async()=>['hector-os-transparent-model-v5','hector-os-static-shell-v6','hector-asi-evolution-shell-v7','hector-asi-stage-6-shell-v8','hector-command-console-v1','hector-command-console-v2','hector-agent-v1.1','pendientes-shell-20260822-91','hector-elegant-chat-v5','hector-elegant-chat-v6','hector-elegant-chat-v7']),
  delete:vi.fn(async()=>true),
  match:vi.fn(async()=>undefined)
 };
 const fetch=vi.fn(async()=>new Response('asset',{status:200,headers:responseHeaders}));
 const self={
  location:{origin:'https://hector.test'},
  clients:{claim:vi.fn(async()=>{})},
  skipWaiting:vi.fn(async()=>{}),
  addEventListener:(type,listener)=>{listeners[type]=listener;}
 };
 vm.runInNewContext(source,{self,caches,fetch,URL,Response,Promise,console});
 return{listeners,cache,caches,fetch,self};
}

function dispatchFetch(listener,request){
 const waits=[];let responsePromise;
 listener({request,respondWith:value=>{responsePromise=Promise.resolve(value);},waitUntil:value=>waits.push(Promise.resolve(value))});
 return{response:()=>responsePromise,settle:async()=>Promise.all(waits)};
}

describe('service worker private cache policy',()=>{
 it.each(['/api/usage','/control/v1/status','/generated/test/records','/runner/v1/status','/evidence/v1/report','/self-improve/v1/proposal','/agent/','/agent/index.html','/hector-agent'])('never intercepts private route %s',path=>{
  const {listeners,fetch,cache}=worker();
  const event=dispatchFetch(listeners.fetch,new Request(`https://hector.test${path}`));
  expect(event.response()).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
  expect(cache.put).not.toHaveBeenCalled();
 });

 it('never intercepts a request carrying Authorization',()=>{
  const {listeners,fetch}=worker();
  const event=dispatchFetch(listeners.fetch,new Request('https://hector.test/assets/app.js',{headers:{Authorization:'Bearer secret'}}));
  expect(event.response()).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
 });

 it.each(['/assets/app.js','/bridge.html','/bridge.css','/bridge.js','/bridge-code-worker.mjs'])('caches allowlisted static asset %s',async path=>{
  const {listeners,cache}=worker({'Cache-Control':'public, max-age=31536000'});
  const event=dispatchFetch(listeners.fetch,new Request(`https://hector.test${path}`));
  expect((await event.response()).status).toBe(200);
  await event.settle();
  expect(cache.put).toHaveBeenCalledOnce();
 });

 it('pre-caches the complete Bridge local shell',async()=>{
  const {listeners,cache}=worker();const waits=[];
  listeners.install({waitUntil:value=>waits.push(Promise.resolve(value))});
  await Promise.all(waits);
  const shell=cache.addAll.mock.calls[0][0];
  expect(shell).toEqual(expect.arrayContaining(['/bridge.html','/bridge.css','/bridge.js','/bridge-code-worker.mjs']));
 });

 it('does not cache private or no-store responses',async()=>{
  for(const policy of ['private, max-age=60','no-store']){
   const {listeners,cache}=worker({'Cache-Control':policy});
   const event=dispatchFetch(listeners.fetch,new Request('https://hector.test/assets/app.js'));
   await event.response();await event.settle();
   expect(cache.put).not.toHaveBeenCalled();
  }
 });

 it('does not intercept arbitrary same-origin GET routes',()=>{
  const {listeners,fetch}=worker();
  const event=dispatchFetch(listeners.fetch,new Request('https://hector.test/health'));
  expect(event.response()).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
 });

 it('rotates only its own elegant-chat caches and preserves other apps',async()=>{
  const {listeners,caches}=worker();const waits=[];
  listeners.activate({waitUntil:value=>waits.push(Promise.resolve(value))});
  await Promise.all(waits);
  expect(caches.delete).toHaveBeenCalledWith('hector-elegant-chat-v5');
  expect(caches.delete).toHaveBeenCalledWith('hector-elegant-chat-v6');
  expect(caches.delete).not.toHaveBeenCalledWith('hector-elegant-chat-v7');
  expect(caches.delete).not.toHaveBeenCalledWith('hector-agent-v1.1');
  expect(caches.delete).not.toHaveBeenCalledWith('pendientes-shell-20260822-91');
  expect(caches.delete).not.toHaveBeenCalledWith('hector-os-transparent-model-v5');
  expect(caches.delete).not.toHaveBeenCalledWith('hector-command-console-v2');
 });

 it('accepts an explicit skip-waiting request from the refreshed client',()=>{
  const {listeners,self}=worker();
  listeners.message({data:{type:'SKIP_WAITING'}});
  expect(self.skipWaiting).toHaveBeenCalledOnce();
 });
});
