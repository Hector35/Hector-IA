const nativeFetch=globalThis.fetch.bind(globalThis);
const PYODIDE_BASE='https://cdn.jsdelivr.net/pyodide/v314.0.2/full/';
let pyodidePromise;

function safeFetch(input,init){
  const raw=typeof input==='string'?input:input?.url;
  const url=new URL(raw,globalThis.location.href);
  if(url.origin==='https://cdn.jsdelivr.net')return nativeFetch(input,init);
  return Promise.reject(new Error(`Red bloqueada dentro del laboratorio: ${url.origin}`));
}

globalThis.fetch=safeFetch;

function serialize(value){
  if(value===undefined)return'';
  if(typeof value==='string')return value;
  try{return JSON.stringify(value,null,2)}catch{return String(value)}
}

async function executeJavaScript(code,write){
  const consoleProxy={
    log:(...args)=>write(args.map(serialize).join(' ')),
    info:(...args)=>write(args.map(serialize).join(' ')),
    warn:(...args)=>write(`WARN ${args.map(serialize).join(' ')}`),
    error:(...args)=>write(`ERROR ${args.map(serialize).join(' ')}`)
  };
  const blocked=()=>{throw new Error('Función bloqueada dentro del laboratorio aislado')};
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const fn=new AsyncFunction('console','fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','postMessage','indexedDB','caches',`"use strict";\n${code}`);
  return await fn(consoleProxy,safeFetch,blocked,blocked,blocked,blocked,blocked,undefined,undefined);
}

async function getPyodide(write){
  if(!pyodidePromise){
    pyodidePromise=(async()=>{
      write('Cargando Python WebAssembly por primera vez…');
      const {loadPyodide}=await import(`${PYODIDE_BASE}pyodide.mjs`);
      const instance=await loadPyodide({indexURL:PYODIDE_BASE});
      return instance;
    })();
  }
  return pyodidePromise;
}

async function executePython(code,write){
  const pyodide=await getPyodide(write);
  pyodide.setStdout({batched:write});
  pyodide.setStderr({batched:line=>write(`STDERR ${line}`)});
  await pyodide.loadPackagesFromImports(code);
  return await pyodide.runPythonAsync(code);
}

self.onmessage=async event=>{
  const {id,language,code}=event.data||{};
  const lines=[];
  const write=line=>{const text=String(line);lines.push(text);self.postMessage({id,type:'stream',line:text})};
  const started=performance.now();
  try{
    const result=language==='python'?await executePython(String(code||''),write):await executeJavaScript(String(code||''),write);
    const durationMs=Math.round(performance.now()-started);
    self.postMessage({id,type:'done',result:serialize(result),output:lines.join('\n'),durationMs});
  }catch(error){
    const durationMs=Math.round(performance.now()-started);
    self.postMessage({id,type:'error',error:error instanceof Error?error.stack||error.message:String(error),output:lines.join('\n'),durationMs});
  }
};
