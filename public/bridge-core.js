const $=selector=>document.querySelector(selector);

function render(target,value){
  $(target).textContent=typeof value==='string'?value:JSON.stringify(value,null,2);
}

async function api(path,options={}){
  const response=await fetch(`/api/hector-bridge${path}`,{
    credentials:'same-origin',
    headers:{'Content-Type':'application/json',...(options.headers||{})},
    ...options
  });
  let data;
  try{data=await response.json()}catch{data={error:`HTTP ${response.status}`}}
  if(!response.ok)throw new Error(data?.error||`HTTP ${response.status}`);
  return data;
}

async function run(button,output,task){
  const node=$(button),old=node.textContent;node.disabled=true;node.textContent='Procesando…';
  try{const data=await task();render(output,data);$('#coreStatus').textContent='CONECTADO'}
  catch(error){render(output,error instanceof Error?error.message:String(error));$('#coreStatus').textContent='ERROR'}
  finally{node.disabled=false;node.textContent=old}
}

async function refreshStatus(){
  try{const data=await api('/status');render('#statusOutput',data);$('#coreStatus').textContent='CONECTADO'}
  catch(error){render('#statusOutput',error instanceof Error?error.message:String(error));$('#coreStatus').textContent='ERROR'}
}

$('#refreshStatus').addEventListener('click',refreshStatus);
$('#listTools').addEventListener('click',()=>run('#listTools','#statusOutput',()=>api('/tools/list')));
$('#searchMemory').addEventListener('click',()=>run('#searchMemory','#memorySearchOutput',()=>api('/memory/search',{method:'POST',body:JSON.stringify({query:$('#memoryQuery').value})})));
$('#writeMemory').addEventListener('click',()=>run('#writeMemory','#memoryWriteOutput',()=>api('/memory/write',{method:'POST',body:JSON.stringify({kind:$('#memoryKind').value,content:$('#memoryContent').value,importance:4})})));
$('#createJob').addEventListener('click',()=>run('#createJob','#jobOutput',()=>api('/jobs/create',{method:'POST',body:JSON.stringify({objective:$('#jobObjective').value})})));
$('#inspectPwa').addEventListener('click',()=>run('#inspectPwa','#pwaOutput',()=>api('/tools/execute',{method:'POST',body:JSON.stringify({name:'pwa.inspect',input:{url:$('#pwaUrl').value}})})));

refreshStatus();