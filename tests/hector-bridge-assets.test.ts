import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('public/bridge.html');
const client=read('public/bridge.js');
const worker=read('public/bridge-code-worker.mjs');
const manifest=JSON.parse(read('public/manifest.webmanifest'));
const security=read('worker/bridge-security.ts');
const server=read('worker/index.ts');

describe('Héctor Bridge capability workspace',()=>{
 it('ships the five requested capability surfaces',()=>{
  for(const panel of ['panel-code','panel-files','panel-audio','panel-iphone','panel-browser'])expect(html).toContain(panel);
  expect(html).toContain('Código y simulaciones');
  expect(html).toContain('Manipular archivos');
  expect(html).toContain('Micrófono y espectro');
  expect(html).toContain('Acciones del iPhone');
  expect(html).toContain('Preparar operaciones web');
 });

 it('keeps the executable assets syntactically valid',()=>{
  expect(()=>new Function(client)).not.toThrow();
  expect(()=>new Function(worker)).not.toThrow();
 });

 it('runs code in a disposable module worker with an explicit timeout',()=>{
  expect(client).toContain("new Worker('/bridge-code-worker.mjs',{type:'module'})");
  expect(client).toContain('Tiempo máximo excedido');
  expect(worker).toContain('URL.createObjectURL');
  expect(worker).toContain('Red bloqueada dentro del laboratorio');
  expect(worker).not.toContain('new AsyncFunction');
 });

 it('uses Pyodide in a web worker and blocks same-origin runner access',()=>{
  expect(worker).toContain('https://cdn.jsdelivr.net/pyodide/v314.0.2/full/');
  expect(worker).toContain('loadPackagesFromImports');
  expect(security).toContain("'wasm-unsafe-eval'");
  expect(security).toContain('connect-src https://cdn.jsdelivr.net');
  expect(security).not.toContain("connect-src 'self' https://cdn.jsdelivr.net");
  expect(security).toContain("'/bridge.html'");
  expect(server).toContain("app.use('*',bridgeSecurity)");
  expect(server).toContain("app.route('/api/action-authority',actionAuthority)");
 });

 it('implements local file transforms and acoustic analysis',()=>{
  expect(client).toContain("crypto.subtle.digest('SHA-256'");
  expect(html).toContain('CSV → JSON');
  expect(client).toContain('new MediaRecorder(stream)');
  expect(client).toContain('createAnalyser()');
  expect(client).toContain('frequencyBinCount');
 });

 it('exposes Bridge as an installed PWA shortcut',()=>{
  expect(manifest.shortcuts).toEqual(expect.arrayContaining([expect.objectContaining({name:'Héctor Bridge',url:'/bridge.html'})]));
 });

 it('connects ChatGPT shortcut design to the native Apple editor',()=>{
  expect(html).toContain('apple_shortcut_create');
  expect(html).toContain('id="createShortcut"');
  expect(client).toContain("shortcuts://create-shortcut");
 });
});
