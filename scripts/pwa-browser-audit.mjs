import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,devices,webkit} from 'playwright';

const BASE_URL=(process.env.BASE_URL||'https://hector-os.hectorhdzr035.workers.dev').replace(/\/$/,'');
const SESSION_TOKEN=(process.env.SESSION_TOKEN||'').trim();
const OUT_DIR=process.env.BROWSER_AUDIT_DIR||'/tmp/pwa-browser-audit';
const base=new URL(BASE_URL);
const registry=JSON.parse(await readFile(new URL('../config/pwa-registry.json',import.meta.url),'utf8'));
const pwas=(registry.installablePwas||[]).filter(pwa=>String(pwa.status||'').startsWith('active'));

if(!pwas.length)throw new Error('No canonical PWAs found in config/pwa-registry.json');
await mkdir(OUT_DIR,{recursive:true});

const report={
  auditedAt:new Date().toISOString(),
  baseUrl:BASE_URL,
  registryVersion:registry.version,
  authenticated:Boolean(SESSION_TOKEN),
  results:[]
};

function absolute(path){return new URL(path,`${BASE_URL}/`).toString();}
function assert(condition,message){if(!condition)throw new Error(message);}
function safeId(value){return String(value).replace(/[^a-z0-9_-]+/gi,'-');}
function isSameOrigin(value){try{return new URL(value).origin===base.origin;}catch{return false;}}
function isCriticalResource(request){return ['document','script','stylesheet'].includes(request.resourceType());}

async function addSessionCookie(context){
  if(!SESSION_TOKEN)return;
  await context.addCookies([{name:'hector_session',value:SESSION_TOKEN,domain:base.hostname,path:'/',secure:base.protocol==='https:',httpOnly:true,sameSite:'Lax'}]);
}

async function instrument(page){
  const telemetry={pageErrors:[],consoleErrors:[],criticalFailures:[],blockedExternal:[],httpErrors:[]};
  page.on('pageerror',error=>telemetry.pageErrors.push(String(error?.message||error)));
  page.on('console',message=>{if(message.type()==='error')telemetry.consoleErrors.push(message.text());});
  page.on('requestfailed',request=>{
    if(isSameOrigin(request.url())&&isCriticalResource(request))telemetry.criticalFailures.push(`${request.resourceType()} ${request.url()} ${request.failure()?.errorText||'failed'}`);
  });
  page.on('response',response=>{
    const request=response.request();
    if(isSameOrigin(response.url())&&response.status()>=400){
      telemetry.httpErrors.push(`${response.status()} ${request.resourceType()} ${response.url()}`);
      if(isCriticalResource(request))telemetry.criticalFailures.push(`${response.status()} ${request.resourceType()} ${response.url()}`);
    }
  });
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith('about:')||url.startsWith('data:')||url.startsWith('blob:')||isSameOrigin(url))return route.continue();
    telemetry.blockedExternal.push(url);
    return route.abort('blockedbyclient');
  });
  return telemetry;
}

async function verifyPwaFiles(pwa){
  const manifestUrl=absolute(pwa.manifest);
  const swUrl=absolute(pwa.serviceWorker);
  const manifestResponse=await fetch(manifestUrl,{redirect:'follow'});
  assert(manifestResponse.ok,`${pwa.id}: manifest returned ${manifestResponse.status}`);
  const manifest=await manifestResponse.json();
  assert(Boolean(manifest.name||manifest.short_name),`${pwa.id}: manifest has no name/short_name`);
  assert(Boolean(manifest.start_url),`${pwa.id}: manifest has no start_url`);
  const swResponse=await fetch(swUrl,{redirect:'follow'});
  assert(swResponse.ok,`${pwa.id}: service worker returned ${swResponse.status}`);
  const swText=await swResponse.text();
  assert(swText.length>40,`${pwa.id}: service worker response is unexpectedly empty`);
  return {manifestUrl,serviceWorkerUrl:swUrl,manifestName:manifest.name||manifest.short_name,startUrl:manifest.start_url,serviceWorkerBytes:swText.length};
}

async function auditRenderedPage(page,pwa,engine,telemetry){
  const target=absolute(pwa.canonicalPath);
  const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
  assert(response,`${pwa.id}/${engine}: no document response`);
  assert(response.status()<400,`${pwa.id}/${engine}: document returned ${response.status()}`);
  await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(1800);

  const snapshot=await page.evaluate(()=>({
    title:document.title,
    body:(document.body?.innerText||'').replace(/\s+/g,' ').trim(),
    manifest:document.querySelector('link[rel="manifest"]')?.getAttribute('href')||null,
    width:window.innerWidth,
    height:window.innerHeight,
    scrollHeight:document.documentElement.scrollHeight
  }));
  assert(snapshot.title.trim().length>0,`${pwa.id}/${engine}: blank title`);
  assert(snapshot.body.length>20,`${pwa.id}/${engine}: rendered body is blank`);
  assert(snapshot.manifest,`${pwa.id}/${engine}: rendered page has no manifest link`);
  assert(new URL(snapshot.manifest,target).origin===base.origin,`${pwa.id}/${engine}: manifest link escaped production origin`);

  const screenshot=`${OUT_DIR}/${safeId(pwa.id)}-${engine}.png`;
  await page.screenshot({path:screenshot,fullPage:true});
  if(telemetry.pageErrors.length)throw new Error(`${pwa.id}/${engine}: page errors: ${telemetry.pageErrors.join(' | ')}`);
  if(telemetry.criticalFailures.length)throw new Error(`${pwa.id}/${engine}: critical resource failures: ${telemetry.criticalFailures.join(' | ')}`);
  return {target,snapshot:{...snapshot,body:snapshot.body.slice(0,500)},screenshot,telemetry};
}

async function exerciseSafeUi(page,pwa){
  const actions=[];
  if(pwa.id==='hector-agent'){
    const status=page.locator('#globalStatus');
    if(await status.count()){
      await page.waitForFunction(()=>!document.querySelector('#globalStatus')?.textContent?.includes('Conectando'),null,{timeout:8000}).catch(()=>{});
      actions.push({action:'agent-status',value:(await status.innerText()).trim()});
    }
    for(const tab of ['goals','tasks','activity','approvals','memory','home']){
      const button=page.locator(`button[data-tab="${tab}"]`);
      assert(await button.count()===1,`hector-agent/webkit: missing ${tab} tab`);
      await button.click();
      await page.waitForTimeout(80);
      assert(await button.evaluate(node=>node.classList.contains('active')),`hector-agent/webkit: ${tab} tab did not activate`);
      actions.push({action:'tab',value:tab});
    }
  }else if(pwa.id==='pendientes'){
    let found=0;
    for(const label of ['Piso','RX','TAC','USG']){
      const button=page.getByRole('button',{name:new RegExp(`^${label}\\b`,'i')}).first();
      if(await button.count()){
        await button.click();
        await page.waitForTimeout(100);
        found+=1;
        actions.push({action:'category-tab',value:label});
      }
    }
    assert(found===4,`pendientes/webkit: expected four category tabs, found ${found}`);
    const manual=page.getByRole('button',{name:/manual/i}).first();
    if(await manual.count()){
      await manual.click();
      await page.waitForTimeout(120);
      actions.push({action:'open-manual-capture'});
      const close=page.getByRole('button',{name:/cerrar|cancelar|volver/i}).first();
      if(await close.count()){
        await close.click();
        actions.push({action:'close-manual-capture'});
      }
    }
  }else{
    const before=await page.evaluate(()=>window.scrollY);
    await page.evaluate(()=>window.scrollTo({top:Math.min(500,Math.max(0,document.documentElement.scrollHeight-window.innerHeight)),behavior:'instant'}));
    await page.waitForTimeout(100);
    const after=await page.evaluate(()=>window.scrollY);
    actions.push({action:'responsive-scroll',before,after});
  }
  return actions;
}

async function webkitMobileAudit(browser,pwa,files){
  const iphone=devices['iPhone 13'];
  const context=await browser.newContext({...iphone,locale:'es-MX'});
  await addSessionCookie(context);
  const page=await context.newPage();
  const telemetry=await instrument(page);
  try{
    const rendered=await auditRenderedPage(page,pwa,'webkit-iphone',telemetry);
    const actions=await exerciseSafeUi(page,pwa);
    const postActionScreenshot=`${OUT_DIR}/${safeId(pwa.id)}-webkit-iphone-after-actions.png`;
    await page.screenshot({path:postActionScreenshot,fullPage:true});
    return {engine:'webkit',device:'iPhone 13',files,rendered,actions,postActionScreenshot,ok:true};
  }finally{await context.close();}
}

async function chromiumPwaAudit(browser,pwa,files){
  const context=await browser.newContext({viewport:{width:430,height:932},locale:'es-MX'});
  await addSessionCookie(context);
  const page=await context.newPage();
  const telemetry=await instrument(page);
  try{
    const rendered=await auditRenderedPage(page,pwa,'chromium',telemetry);
    const registration=await page.evaluate(async({serviceWorker,scope})=>{
      if(!('serviceWorker' in navigator))throw new Error('navigator.serviceWorker unavailable');
      const reg=await navigator.serviceWorker.register(serviceWorker,{scope});
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('service worker ready timeout')),10000))
      ]);
      return {scope:reg.scope,active:reg.active?.state||null};
    },{serviceWorker:pwa.serviceWorker,scope:pwa.canonicalPath});
    assert(registration.active==='activated',`${pwa.id}/chromium: service worker did not activate (${registration.active})`);

    await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(800);
    const controlled=await page.evaluate(()=>Boolean(navigator.serviceWorker.controller));
    assert(controlled,`${pwa.id}/chromium: page is not controlled by its service worker after reload`);

    await context.setOffline(true);
    const offlineResponse=await page.reload({waitUntil:'domcontentloaded',timeout:20000}).catch(()=>null);
    await page.waitForTimeout(500);
    const offlineBody=await page.evaluate(()=>(document.body?.innerText||'').replace(/\s+/g,' ').trim()).catch(()=> '');
    assert(offlineBody.length>20,`${pwa.id}/chromium: offline shell did not render`);
    await context.setOffline(false);

    const screenshot=`${OUT_DIR}/${safeId(pwa.id)}-chromium-offline.png`;
    await page.screenshot({path:screenshot,fullPage:true});
    await page.evaluate(async()=>{for(const reg of await navigator.serviceWorker.getRegistrations())await reg.unregister();}).catch(()=>{});
    return {engine:'chromium',files,rendered,registration,controlled,offline:{documentStatus:offlineResponse?.status?.()??null,body:offlineBody.slice(0,300)},screenshot,ok:true};
  }finally{await context.close();}
}

const webkitBrowser=await webkit.launch({headless:true});
const chromiumBrowser=await chromium.launch({headless:true});
let failed=false;
try{
  for(const pwa of pwas){
    const result={id:pwa.id,name:pwa.name,path:pwa.canonicalPath,checks:[]};
    try{
      const files=await verifyPwaFiles(pwa);
      result.checks.push(await webkitMobileAudit(webkitBrowser,pwa,files));
      result.checks.push(await chromiumPwaAudit(chromiumBrowser,pwa,files));
      result.ok=true;
      console.log(`✅ ${pwa.name}: WebKit iPhone + Chromium PWA/offline`);
    }catch(error){
      failed=true;
      result.ok=false;
      result.error=error instanceof Error?error.stack||error.message:String(error);
      console.error(`❌ ${pwa.name}: ${result.error}`);
    }
    report.results.push(result);
  }
}finally{
  await Promise.allSettled([webkitBrowser.close(),chromiumBrowser.close()]);
}

report.ok=!failed;
await writeFile(`${OUT_DIR}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(failed)process.exitCode=1;
