import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const baseUrl=process.env.VISUAL_AUDIT_URL||'http://127.0.0.1:4173';
const outputDir=process.env.VISUAL_AUDIT_OUTPUT||'visual-audit';
const fixedTimestamp='2026-08-16T12:00:00.000Z';
const devices=[
 {id:'iphone-se',label:'iPhone SE',viewport:{width:320,height:568}},
 {id:'iphone-13-pro',label:'iPhone 13 Pro',viewport:{width:390,height:844}}
];
const legacyComposer='.hcComposer textarea, .hxComposer textarea, .haComposer textarea, .cxComposer textarea';

function json(body,status=200){return{status,contentType:'application/json',body:JSON.stringify(body)};}
function responseFor(url,method){
 const path=new URL(url).pathname;
 if(path==='/api/vision'&&method==='POST')return json({text:JSON.stringify({bed:'C#22',name:'Paciente de prueba',birthDate:'1963-07-29',age:63,study:'TAC simple de cráneo',transport:'Camilla',transportReason:'TCE visible en la solicitud',oxygenProbable:false,oxygenReason:''})});
 if(path==='/api/auth/me')return json({user:{id:'visual-owner',name:'Héctor'}});
 if(path==='/api/dashboard')return json({balanceCents:439650,memoryCount:12,nextEvent:{title:'Auditoría visual'},recentFile:{name:'evidence.png'}});
 if(path==='/api/conversations')return json({items:[{id:'conversation-1',title:'Prueba de diseño en iPhone'}]});
 if(path==='/api/conversations/conversation-1/messages')return json({items:[{role:'assistant',content:'Interfaz preparada para revisión visual.'}]});
 if(path==='/api/assistant/context')return json({learnedFrom:12,suggestions:['Revisar prioridades','Ver evidencia']});
 if(path==='/api/assistant/skills')return json({items:[]});
 if(path==='/api/assistant/settings')return json({allow_web:true,allow_learning:true});
 if(path==='/api/memories'||path==='/api/files')return json({items:[]});
 if(path==='/api/usage')return json({summary:[]});
 if(path==='/api/work/jobs')return json({items:[]});
 if(path==='/api/work-mode')return json({items:[]});
 if(path==='/api/intelligence/self-model')return json({identity:{name:'Hector ASI',mission:'Inteligencia privada y verificable',knowledgeVersion:'visual-test'},models:{fast:'gpt-5.6-luna',balanced:'gpt-5.6-terra',reasoning:'gpt-5.6-sol',critic:'gpt-5.6-sol'},runtime:{memories:12,workJobs:{total:4,completed:3,blocked:0},scheduledTasks:{total:2,active:2},responseTraces:8,activeSystemContexts:5},architecture:['PWA'],capabilities:[],limitations:[]});
 if(path==='/api/intelligence/status')return json({models:{fast:'gpt-5.6-luna',balanced:'gpt-5.6-terra',reasoning:'gpt-5.6-sol'}});
 if(path==='/api/intelligence/deliberation-status')return json({enabled:true,mode:'adaptive',budget:{remainingUsd:5}});
 if(path.startsWith('/api/'))return method==='GET'?json({items:[],summary:[]}):json({ok:true});
 return null;
}

async function auditOverflow(page,viewport){
 return page.evaluate(({width,height})=>{
  const documentOverflow=Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-width;
  const offenders=[];
  for(const element of document.querySelectorAll('body *')){
   const style=getComputedStyle(element);
   if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||element.closest('[inert]'))continue;
   const rect=element.getBoundingClientRect();
   if(rect.width<1||rect.height<1)continue;
   if(rect.left<-2||rect.right>width+2)offenders.push({tag:element.tagName.toLowerCase(),className:String(element.className||'').slice(0,120),left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width)});
  }
  const fixedBlocking=[...document.querySelectorAll('body *')].filter(element=>{
   const style=getComputedStyle(element),rect=element.getBoundingClientRect();
   return !element.closest('[inert]')&&style.position==='fixed'&&rect.width>width*.9&&rect.height>height*.65&&style.pointerEvents!=='none';
  }).map(element=>({tag:element.tagName.toLowerCase(),className:String(element.className||'').slice(0,120)}));
  return{documentOverflow,offenders:offenders.slice(0,20),fixedBlocking};
 },viewport);
}

async function auditFocus(page){
 await page.keyboard.press('Tab');
 const active=await page.evaluate(()=>{
  const element=document.activeElement;
  if(!element||element===document.body)return null;
  const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
  return{tag:element.tagName.toLowerCase(),label:element.getAttribute('aria-label')||element.textContent?.trim().slice(0,80)||'',visible:rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&style.display!=='none',outline:style.outlineStyle!=='none'||style.boxShadow!=='none'};
 });
 if(!active?.visible)throw new Error('El foco de teclado no quedó en un elemento visible');
 return active;
}

function slug(value){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-');}

async function waitForSurface(page){
 await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(selector=>Boolean(document.querySelector(selector)),`.shift-app, ${legacyComposer}`,{timeout:15000});
 if(await page.locator('.shift-app').count()){
  await page.getByRole('heading',{name:'Pacientes'}).waitFor({state:'visible',timeout:15000});
  return'patient-shift';
 }
 await page.locator(legacyComposer).first().waitFor({state:'visible',timeout:15000});
 return'legacy-chat';
}

await mkdir(outputDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={baseUrl,checkedAt:new Date().toISOString(),fixtureTimestamp:fixedTimestamp,devices:[],summary:{passed:true,failures:0}};
try{
 for(const device of devices){
  const context=await browser.newContext({viewport:device.viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  const consoleErrors=[];
  const mockedRequests=[];
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
  page.on('pageerror',error=>consoleErrors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),fixture=responseFor(request.url(),request.method());
   if(fixture){mockedRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);await route.fulfill(fixture);}else await route.continue();
  });
  const deviceReport={id:device.id,label:device.label,viewport:device.viewport,mode:null,views:[],consoleErrors,mockedRequests};
  try{
   const mode=await waitForSurface(page);deviceReport.mode=mode;
   const views=mode==='patient-shift'?[{label:'Rayos X',activate:async()=>page.getByRole('button',{name:/Rayos X/}).click()},{label:'Pacientes a piso',activate:async()=>page.getByRole('button',{name:/Pacientes a piso/}).click()}]:[{label:'Chat único',activate:async()=>{}}];
   for(const view of views){
    await view.activate();
    await page.waitForTimeout(200);
    const overflow=await auditOverflow(page,device.viewport);
    const focus=await auditFocus(page);
    const file=`${outputDir}/${device.id}-${slug(view.label)}.png`;
    await page.screenshot({path:file,fullPage:true,animations:'disabled'});
    const failures=[];
    if(overflow.documentOverflow>2)failures.push(`desbordamiento documental de ${overflow.documentOverflow}px`);
    if(overflow.offenders.length)failures.push(`${overflow.offenders.length} elementos fuera del viewport`);
    if(overflow.fixedBlocking.length)failures.push('una superficie fija bloquea casi toda la pantalla');
    deviceReport.views.push({label:view.label,screenshot:file,overflow,focus,passed:failures.length===0,failures});
    if(failures.length){report.summary.passed=false;report.summary.failures+=failures.length;}
   }
   if(consoleErrors.length){report.summary.passed=false;report.summary.failures+=consoleErrors.length;}
  }catch(error){
   const fatalFile=`${outputDir}/${device.id}-fatal.png`;
   await page.screenshot({path:fatalFile,fullPage:true,animations:'disabled'}).catch(()=>{});
   deviceReport.fatal=error instanceof Error?error.message:String(error);
   deviceReport.fatalScreenshot=fatalFile;
   deviceReport.currentUrl=page.url();
   deviceReport.bodyText=(await page.locator('body').innerText().catch(()=>'' )).slice(0,2000);
   report.summary.passed=false;report.summary.failures+=1;
  }finally{report.devices.push(deviceReport);await context.close();}
 }
}finally{await browser.close();}
await writeFile(`${outputDir}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.summary.passed)process.exitCode=1;
