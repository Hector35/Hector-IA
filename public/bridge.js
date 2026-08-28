const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const state={files:[],worker:null,executionId:null,audio:null,recordedBlob:null,downloadUrls:[]};
const examples={
 python:`import math\n\nvoltajes = [5.1, 5.0, 4.8, 4.6, 4.4]\ncorriente_a = 0.72\npotencias = [round(v * corriente_a, 3) for v in voltajes]\nprint("Potencias W:", potencias)\nprint("Promedio W:", round(sum(potencias) / len(potencias), 3))\nprint("Energía en 5 h (Wh):", round(sum(potencias) / len(potencias) * 5, 2))`,
 javascript:`const voltajes = [5.1, 5.0, 4.8, 4.6, 4.4];\nconst corrienteA = 0.72;\nconst potencias = voltajes.map(v => Number((v * corrienteA).toFixed(3)));\nconsole.log('Potencias W:', potencias);\nconsole.log('Promedio W:', potencias.reduce((a,b)=>a+b,0)/potencias.length);\nreturn {energiaWh: potencias.reduce((a,b)=>a+b,0)/potencias.length*5};`
};

function activateTab(name){
  $$('.tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===name));
  $$('.toolPanel').forEach(panel=>panel.classList.toggle('active',panel.id===`panel-${name}`));
  history.replaceState(null,'',`#${name}`);
}

$$('.tab').forEach(button=>button.addEventListener('click',()=>activateTab(button.dataset.tab)));
const initialTab=location.hash.slice(1);
if(['code','files','audio','iphone','browser'].includes(initialTab))activateTab(initialTab);

function setGlobalStatus(text,tone='local'){
  const node=$('#globalStatus');node.textContent=text;node.style.color=tone==='error'?'#ff9aa5':tone==='busy'?'#ffd166':'#d8ff3e';
}

function stopWorker(reason='Ejecución detenida por el usuario.'){
  if(state.worker)state.worker.terminate();
  state.worker=null;state.executionId=null;
  $('#runCode').disabled=false;$('#stopCode').disabled=true;
  setGlobalStatus('LOCAL');
  if(reason)$('#codeOutput').textContent+=`\n${reason}`;
}

function runCode(){
  stopWorker('');
  const language=$('#languageSelect').value;
  const code=$('#codeEditor').value;
  const timeout=Number($('#timeoutSelect').value);
  const output=$('#codeOutput');
  output.textContent='';
  const executionId=crypto.randomUUID();
  const worker=new Worker('/bridge-code-worker.mjs',{type:'module'});
  state.worker=worker;state.executionId=executionId;
  $('#runCode').disabled=true;$('#stopCode').disabled=false;
  $('#executionMeta').textContent=`${language} · ejecutando`;
  setGlobalStatus('EJECUTANDO','busy');
  const timer=setTimeout(()=>{
    if(state.executionId!==executionId)return;
    stopWorker(`\nTiempo máximo excedido (${timeout/1000} s). El proceso fue terminado.`);
    $('#executionMeta').textContent=`${language} · timeout`;
  },timeout);
  worker.onmessage=event=>{
    const message=event.data||{};
    if(message.id!==executionId)return;
    if(message.type==='stream')output.textContent+=`${message.line}\n`;
    if(message.type==='done'||message.type==='error'){
      clearTimeout(timer);
      if(message.result)output.textContent+=`${output.textContent?'\n':''}Resultado:\n${message.result}`;
      if(message.type==='error')output.textContent+=`${output.textContent?'\n':''}${message.error}`;
      $('#executionMeta').textContent=`${language} · ${message.durationMs} ms · ${message.type==='done'?'correcto':'error'}`;
      stopWorker('');
    }
  };
  worker.onerror=event=>{
    clearTimeout(timer);
    output.textContent+=`\nError del worker: ${event.message}`;
    $('#executionMeta').textContent=`${language} · error de entorno`;
    stopWorker('');
  };
  worker.postMessage({id:executionId,language,code});
}

$('#runCode').addEventListener('click',runCode);
$('#stopCode').addEventListener('click',()=>stopWorker());
$('#clearOutput').addEventListener('click',()=>{$('#codeOutput').textContent='Listo.';$('#executionMeta').textContent='Sin ejecutar'});
$('#loadExample').addEventListener('click',()=>{$('#codeEditor').value=examples[$('#languageSelect').value]});
$('#languageSelect').addEventListener('change',()=>{$('#codeEditor').value=examples[$('#languageSelect').value]});

function humanBytes(bytes){if(bytes<1024)return`${bytes} B`;if(bytes<1048576)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/1048576).toFixed(1)} MB`}
function renderFiles(){
  $('#fileMeta').textContent=`${state.files.length} archivo${state.files.length===1?'':'s'}`;
  $('#fileList').innerHTML=state.files.length?state.files.map((file,index)=>`<article class="fileItem"><div><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(file.type||'tipo desconocido')} · ${humanBytes(file.size)}</span></div><button class="ghostButton removeFile" data-index="${index}">Quitar</button></article>`).join(''):'<p class="emptyState">Todavía no hay archivos.</p>';
  $$('.removeFile').forEach(button=>button.addEventListener('click',()=>{state.files.splice(Number(button.dataset.index),1);renderFiles()}));
}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function addFiles(files){state.files.push(...[...files]);renderFiles()}
$('#fileInput').addEventListener('change',event=>addFiles(event.target.files));
const dropZone=$('#dropZone');
['dragenter','dragover'].forEach(type=>dropZone.addEventListener(type,event=>{event.preventDefault();dropZone.classList.add('dragging')}));
['dragleave','drop'].forEach(type=>dropZone.addEventListener(type,event=>{event.preventDefault();dropZone.classList.remove('dragging')}));
dropZone.addEventListener('drop',event=>addFiles(event.dataTransfer.files));

async function readText(file){return await file.text()}
async function sha256(file){const buffer=await file.arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',buffer);return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function clearDownloads(){state.downloadUrls.forEach(URL.revokeObjectURL);state.downloadUrls=[];$('#downloadArea').innerHTML=''}
function downloadable(name,content,type='text/plain;charset=utf-8'){
  clearDownloads();const url=URL.createObjectURL(new Blob([content],{type}));state.downloadUrls.push(url);const link=document.createElement('a');link.className='downloadLink';link.href=url;link.download=name;link.textContent=`Descargar ${name}`;$('#downloadArea').append(link);
}

$('#inspectFiles').addEventListener('click',async()=>{
  clearDownloads();if(!state.files.length)return $('#fileOutput').textContent='No hay archivos.';
  const lines=[];
  for(const file of state.files){
    lines.push(`${file.name}\n  tipo: ${file.type||'desconocido'}\n  tamaño: ${humanBytes(file.size)}\n  modificado: ${new Date(file.lastModified).toLocaleString('es-MX')}\n  sha256: ${await sha256(file)}`);
    if(file.type.startsWith('text/')||/\.(txt|csv|json|md|js|ts|py)$/i.test(file.name)){const text=await readText(file);lines.push(`  vista previa:\n${text.slice(0,600)}${text.length>600?'\n  …':''}`)}
  }
  $('#fileOutput').textContent=lines.join('\n\n');
});

$('#combineText').addEventListener('click',async()=>{
  const usable=state.files.filter(file=>file.type.startsWith('text/')||/\.(txt|csv|json|md|js|ts|py)$/i.test(file.name));
  if(!usable.length)return $('#fileOutput').textContent='No hay archivos de texto compatibles.';
  const chunks=[];for(const file of usable)chunks.push(`===== ${file.name} =====\n${await readText(file)}`);
  const content=chunks.join('\n\n');$('#fileOutput').textContent=content.slice(0,5000);downloadable('hector-bridge-combinado.txt',content);
});

$('#formatJson').addEventListener('click',async()=>{
  const file=state.files.find(item=>/\.json$/i.test(item.name)||item.type==='application/json');
  if(!file)return $('#fileOutput').textContent='Selecciona al menos un archivo JSON.';
  try{const formatted=JSON.stringify(JSON.parse(await readText(file)),null,2);$('#fileOutput').textContent=formatted.slice(0,5000);downloadable(file.name.replace(/\.json$/i,'')+'-formateado.json',formatted,'application/json')}catch(error){$('#fileOutput').textContent=`JSON inválido: ${error.message}`}
});

function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const char=text[i],next=text[i+1];if(char==='"'&&quoted&&next==='"'){cell+='"';i++;continue}if(char==='"'){quoted=!quoted;continue}if(char===','&&!quoted){row.push(cell);cell='';continue}if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&next==='\n')i++;row.push(cell);if(row.some(value=>value!==''))rows.push(row);row=[];cell='';continue}cell+=char}row.push(cell);if(row.some(value=>value!==''))rows.push(row);return rows;
}
$('#csvToJson').addEventListener('click',async()=>{
  const file=state.files.find(item=>/\.csv$/i.test(item.name)||item.type==='text/csv');if(!file)return $('#fileOutput').textContent='Selecciona un archivo CSV.';
  const rows=parseCsv(await readText(file));if(!rows.length)return $('#fileOutput').textContent='CSV vacío.';
  const [headers,...data]=rows;const objects=data.map(row=>Object.fromEntries(headers.map((header,index)=>[header||`columna_${index+1}`,row[index]??''])));const json=JSON.stringify(objects,null,2);
  $('#fileOutput').textContent=`Filas: ${objects.length}\nColumnas: ${headers.length}\nEncabezados: ${headers.join(', ')}\n\n${json.slice(0,4500)}`;downloadable(file.name.replace(/\.csv$/i,'')+'.json',json,'application/json');
});
$('#clearFiles').addEventListener('click',()=>{state.files=[];clearDownloads();renderFiles();$('#fileOutput').textContent='Selecciona archivos para comenzar.'});

function drawAudio(){
  const audio=state.audio;if(!audio)return;
  const {analyser,waveCanvas,spectrumCanvas,startedAt}=audio;
  const waveCtx=waveCanvas.getContext('2d'),spectrumCtx=spectrumCanvas.getContext('2d');
  const timeData=new Uint8Array(analyser.fftSize),freqData=new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(timeData);analyser.getByteFrequencyData(freqData);
  waveCtx.clearRect(0,0,waveCanvas.width,waveCanvas.height);waveCtx.strokeStyle='#d8ff3e';waveCtx.lineWidth=2;waveCtx.beginPath();
  timeData.forEach((value,index)=>{const x=index/(timeData.length-1)*waveCanvas.width,y=value/255*waveCanvas.height;if(index===0)waveCtx.moveTo(x,y);else waveCtx.lineTo(x,y)});waveCtx.stroke();
  spectrumCtx.clearRect(0,0,spectrumCanvas.width,spectrumCanvas.height);const barWidth=spectrumCanvas.width/freqData.length*3;let max=0,maxIndex=0,sumSquares=0;
  for(let i=0;i<freqData.length;i++){const magnitude=freqData[i];if(magnitude>max){max=magnitude;maxIndex=i}const h=magnitude/255*spectrumCanvas.height;spectrumCtx.fillStyle=`rgba(216,255,62,${.2+magnitude/330})`;spectrumCtx.fillRect(i*barWidth,spectrumCanvas.height-h,Math.max(1,barWidth-1),h)}
  for(const value of timeData){const normalized=(value-128)/128;sumSquares+=normalized*normalized}
  const rms=Math.sqrt(sumSquares/timeData.length),db=rms>0?20*Math.log10(rms):-Infinity,frequency=maxIndex*audio.context.sampleRate/analyser.fftSize;
  $('#dominantHz').textContent=`${Math.round(frequency)} Hz`;$('#dbLevel').textContent=Number.isFinite(db)?`${db.toFixed(1)} dBFS`:'−∞ dBFS';
  const seconds=Math.floor((Date.now()-startedAt)/1000);$('#recordingTime').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  audio.animation=requestAnimationFrame(drawAudio);
}

$('#startAudio').addEventListener('click',async()=>{
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    const context=new AudioContext(),source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=.76;source.connect(analyser);
    const chunks=[],recorder=new MediaRecorder(stream);recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};recorder.onstop=()=>{state.recordedBlob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});$('#downloadAudio').disabled=false};recorder.start(500);
    state.audio={stream,context,source,analyser,recorder,waveCanvas:$('#waveformCanvas'),spectrumCanvas:$('#spectrumCanvas'),startedAt:Date.now(),animation:null};
    $('#startAudio').disabled=true;$('#stopAudio').disabled=false;$('#downloadAudio').disabled=true;setGlobalStatus('ESCUCHANDO','busy');drawAudio();
  }catch(error){setGlobalStatus('ERROR','error');alert(`No se pudo acceder al micrófono: ${error.message}`)}
});
$('#stopAudio').addEventListener('click',async()=>{
  const audio=state.audio;if(!audio)return;cancelAnimationFrame(audio.animation);audio.recorder.stop();audio.stream.getTracks().forEach(track=>track.stop());await audio.context.close();state.audio=null;$('#startAudio').disabled=false;$('#stopAudio').disabled=true;setGlobalStatus('LOCAL');
});
$('#downloadAudio').addEventListener('click',()=>{if(!state.recordedBlob)return;const url=URL.createObjectURL(state.recordedBlob);const a=document.createElement('a');a.href=url;a.download=`hector-audio-${new Date().toISOString().replace(/[:.]/g,'-')}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)});

function shortcutUrl(clipboard=false){const name=encodeURIComponent($('#shortcutName').value.trim()||'Hector Bridge');if(clipboard)return`shortcuts://run-shortcut?name=${name}&input=clipboard`;return`shortcuts://run-shortcut?name=${name}&input=text&text=${encodeURIComponent($('#shortcutPayload').value)}`}
$('#createShortcut').addEventListener('click',()=>{const purpose=$('#shortcutPurpose').value.trim();if(!purpose){alert('Describe primero qué quieres automatizar para que ChatGPT pueda diseñarlo.');$('#shortcutPurpose').focus();return}localStorage.setItem('hector-shortcut-draft',JSON.stringify({name:$('#shortcutName').value.trim()||'Hector Bridge',purpose,payload:$('#shortcutPayload').value}));location.href='shortcuts://create-shortcut'});
$('#runShortcut').addEventListener('click',()=>{location.href=shortcutUrl(false)});
$('#runClipboardShortcut').addEventListener('click',()=>{location.href=shortcutUrl(true)});
$('#openShortcuts').addEventListener('click',()=>{location.href='shortcuts://'});
$('#openCurrentLocation').addEventListener('click',()=>navigator.geolocation.getCurrentPosition(position=>{const {latitude,longitude}=position.coords;location.href=`maps://?ll=${latitude},${longitude}&q=Ubicación%20actual`},error=>alert(`No se pudo obtener la ubicación: ${error.message}`),{enableHighAccuracy:true,timeout:12000}));

function normalizeUrl(value){const text=value.trim();if(!text)return'';try{return new URL(text.includes('://')?text:`https://${text}`).toString()}catch{return''}}
function loadBrowserQueue(){try{return JSON.parse(localStorage.getItem('hector-bridge-browser-queue')||'[]')}catch{return[]}}
function saveBrowserQueue(items){localStorage.setItem('hector-bridge-browser-queue',JSON.stringify(items));renderBrowserQueue()}
function renderBrowserQueue(){const items=loadBrowserQueue();$('#browserQueue').innerHTML=items.length?items.map(item=>`<article class="queueItem"><strong>${escapeHtml(item.url)}</strong><span>${new Date(item.createdAt).toLocaleString('es-MX')}</span><p>${escapeHtml(item.task)}</p></article>`).join(''):'<p class="emptyState">No hay tareas guardadas.</p>'}
$('#openBrowserUrl').addEventListener('click',()=>{const url=normalizeUrl($('#browserUrl').value);if(!url)return alert('Escribe una URL válida.');window.open(url,'_blank','noopener,noreferrer')});
$('#saveBrowserTask').addEventListener('click',()=>{const url=normalizeUrl($('#browserUrl').value),task=$('#browserTask').value.trim();if(!url||!task)return alert('Escribe un sitio y un objetivo.');const items=loadBrowserQueue();items.unshift({id:crypto.randomUUID(),url,task,createdAt:new Date().toISOString(),status:'prepared'});saveBrowserQueue(items.slice(0,30))});
$('#clearBrowserTasks').addEventListener('click',()=>saveBrowserQueue([]));

renderFiles();renderBrowserQueue();
window.addEventListener('beforeunload',()=>{stopWorker('');state.downloadUrls.forEach(URL.revokeObjectURL);if(state.audio){state.audio.stream.getTracks().forEach(track=>track.stop());state.audio.context.close()}});
