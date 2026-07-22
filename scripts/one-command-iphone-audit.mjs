import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const baseUrl=process.env.ONE_COMMAND_AUDIT_URL||'http://127.0.0.1:4173';
const outputDir=process.env.ONE_COMMAND_AUDIT_OUTPUT||'one-command-audit';
const devices=[
 {id:'iphone-se',label:'iPhone SE',viewport:{width:320,height:568}},
 {id:'iphone-13-pro',label:'iPhone 13 Pro',viewport:{width:390,height:844}}
];

function json(body,status=200){return{status,contentType:'application/json',body:JSON.stringify(body)};}
function responseFor(url,method){
 const path=new URL(url).pathname;
 if(path==='/api/auth/me')return json({user:{id:'one-command-owner',name:'Héctor'}});
 if(path==='/api/conversations')return json({items:[]});
 if(path==='/api/dashboard')return json({balanceCents:0,memoryCount:0,nextEvent:null,recentFile:null});
 if(path==='/api/assistant/context')return json({learnedFrom:0,suggestions:[]});
 if(path==='/api/assistant/skills')return json({items:[]});
 if(path==='/api/assistant/settings')return json({allow_web:true,allow_learning:true});
 if(path==='/api/memories'||path==='/api/files')return json({items:[]});
 if(path==='/api/usage')return json({summary:[]});
 if(path==='/api/work/jobs')return json({items:[]});
 if(path==='/api/work-mode'&&method==='GET')return json({items:[]});
 if(path==='/api/work-mode'&&method==='POST')return json({item:{id:'work-from-chat',title:'Terminar aplicación',status:'queued',progress:0}},201);
 if(path==='/api/schedules'&&method==='GET')return json({items:[]});
 if(path==='/api/schedules'&&method==='POST')return json({item:{id:'schedule-from-chat',title:'Revisar proyecto',enabled:true}},201);
 if(path==='/api/intelligence/self-model')return json({identity:{name:'Hector ASI',mission:'Inteligencia privada',knowledgeVersion:'test'},models:{fast:'gpt-5.6-luna',balanced:'gpt-5.6-terra',reasoning:'gpt-5.6-sol',critic:'gpt-5.6-sol'},runtime:{memories:0,workJobs:{total:0,completed:0,blocked:0},scheduledTasks:{total:0,active:0},responseTraces:0,activeSystemContexts:0},architecture:['PWA'],capabilities:[],limitations:[]});
 if(path==='/api/intelligence/status')return json({models:{fast:'gpt-5.6-luna',balanced:'gpt-5.6-terra',reasoning:'gpt-5.6-sol'}});
 if(path==='/api/intelligence/deliberation-status')return json({enabled:true,mode:'adaptive',budget:{remainingUsd:5}});
 if(path.startsWith('/api/chat-agents/'))return json({items:[],agents:[],turns:[],run:null});
 if(path.startsWith('/api/'))return method==='GET'?json({items:[],summary:[]}):json({ok:true});
 return null;
}

async function waitForChat(page){
 await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('.haComposer textarea').waitFor({state:'visible',timeout:15000});
 await page.getByText('Hector ASI',{exact:true}).last().waitFor({state:'visible',timeout:15000});
}

async function runScheduleFlow(page){
 const textarea=page.locator('.haComposer textarea'),handle=await textarea.elementHandle();
 if(!handle)throw new Error('No se encontró la entrada única para Programaciones');
 const command='Cada 15 minutos revisa el estado del proyecto y reporta avances.';
 await textarea.fill(command);
 const [request]=await Promise.all([
  page.waitForRequest(req=>new URL(req.url()).pathname==='/api/schedules'&&req.method()==='POST'),
  textarea.press('Enter')
 ]);
 const payload=request.postDataJSON();
 if(payload.cadence!=='custom_minutes'||payload.intervalMinutes!==15||payload.reasoningLevel!=='high'||payload.autonomyMode!=='continuous')throw new Error(`Payload de Programaciones incorrecto: ${JSON.stringify(payload)}`);
 await page.getByText('Programación creada',{exact:true}).waitFor({state:'visible',timeout:10000});
 await page.getByText(/sus ejecuciones y resultados aparecerán aquí mismo/i).waitFor({state:'visible',timeout:10000});
 const cleared=await handle.evaluate(node=>node.value);
 if(cleared!=='')throw new Error('La entrada no se limpió después de crear la programación');
 await page.locator('.haMessages').waitFor({state:'visible',timeout:10000});
 return{command,payload,receiptVisible:true,inputCleared:true,sameChat:true};
}

async function runWorkFlow(page){
 await waitForChat(page);
 const textarea=page.locator('.haComposer textarea'),handle=await textarea.elementHandle();
 if(!handle)throw new Error('No se encontró la entrada única para Trabajo');
 const command='Termina la aplicación y no te detengas hasta dejarla funcionando.';
 await textarea.fill(command);
 const [request]=await Promise.all([
  page.waitForRequest(req=>new URL(req.url()).pathname==='/api/work-mode'&&req.method()==='POST'),
  textarea.press('Enter')
 ]);
 const payload=request.postDataJSON();
 if(payload.goal!==command)throw new Error(`Objetivo de Trabajo incorrecto: ${JSON.stringify(payload)}`);
 await page.getByText('Trabajo autónomo iniciado',{exact:true}).waitFor({state:'visible',timeout:10000});
 await page.getByText(/el seguimiento aparecerá automáticamente dentro de este chat/i).waitFor({state:'visible',timeout:10000});
 const cleared=await handle.evaluate(node=>node.value);
 if(cleared!=='')throw new Error('La entrada no se limpió después de activar Trabajo');
 await page.locator('.haMessages').waitFor({state:'visible',timeout:10000});
 return{command,payload,receiptVisible:true,inputCleared:true,sameChat:true};
}

await mkdir(outputDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={baseUrl,checkedAt:new Date().toISOString(),devices:[],passed:true};
try{
 for(const device of devices){
  const context=await browser.newContext({viewport:device.viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{const fixture=responseFor(route.request().url(),route.request().method());if(fixture)await route.fulfill(fixture);else await route.continue();});
  const result={id:device.id,label:device.label,viewport:device.viewport,schedule:null,work:null,errors:[],passed:true};
  try{
   await waitForChat(page);
   result.schedule=await runScheduleFlow(page);
   result.work=await runWorkFlow(page);
   if(errors.length)throw new Error(`Errores de página: ${errors.join(' | ')}`);
   await page.screenshot({path:`${outputDir}/${device.id}-chat-results.png`,fullPage:true,animations:'disabled'});
  }catch(error){result.passed=false;result.errors.push(error instanceof Error?error.message:String(error));report.passed=false;await page.screenshot({path:`${outputDir}/${device.id}-failure.png`,fullPage:true,animations:'disabled'}).catch(()=>{});}
  report.devices.push(result);await context.close();
 }
}finally{await browser.close();}
await writeFile(`${outputDir}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
