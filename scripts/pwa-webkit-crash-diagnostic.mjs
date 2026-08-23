import {mkdir,writeFile} from 'node:fs/promises';
import {devices,webkit} from 'playwright';

const BASE_URL=(process.env.BASE_URL||'https://hector-os.hectorhdzr035.workers.dev').replace(/\/$/,'');
const SESSION_TOKEN=(process.env.SESSION_TOKEN||'').trim();
const OUT_DIR=process.env.BROWSER_AUDIT_DIR||'/tmp/pwa-browser-audit';
const target=`${BASE_URL}/turno-rx/`;
const base=new URL(BASE_URL);
const iphone=devices['iPhone 13'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await mkdir(OUT_DIR,{recursive:true});

const orderedScripts=[
  'stability-guard-v66','runtime-preflight-v89','review-confidence-v67','photo-fingerprint-history-v70',
  'floor-intelligence-v64','photo-dedupe-v68','app-v16','runtime-hardening-v86','capture-fix-v80',
  'capture-ios-v88','patient-detail-history-v82','interaction-runtime-v85','manual-category-v72','e2e-v74'
];
const scriptName=req=>{
  try{return new URL(req.url()).pathname.split('/').pop()?.replace(/\.js$/,'')||'';}catch{return '';}
};
const prefixCase=count=>({
  id:`script-prefix-${count}`,
  javaScriptEnabled:true,
  block:req=>req.resourceType()==='script'&&!orderedScripts.slice(0,count).includes(scriptName(req))&&!/^progressive-photo-queue-v45$/.test(scriptName(req)),
  description:`Production script prefix 1..${count} with full CSS`
});
const cases=[
  {id:'no-js',javaScriptEnabled:false,block:()=>false,description:'HTML + CSS, JavaScript disabled'},
  {id:'no-css',javaScriptEnabled:true,block:req=>req.resourceType()==='stylesheet',description:'JavaScript with all stylesheets blocked'},
  {id:'app-core-only',javaScriptEnabled:true,block:req=>req.resourceType()==='script'&&!/^(app-v16|progressive-photo-queue-v45)$/.test(scriptName(req)),description:'Only app-v16 + progressive photo queue scripts'},
  ...[2,4,6,8,10,12,14].map(prefixCase),
];

async function closeBounded(browser){
  if(!browser)return;
  await Promise.race([browser.close().catch(()=>{}),sleep(3000)]);
}

async function runCase(testCase){
  let browser,context,page;
  const started=Date.now();
  const result={id:testCase.id,description:testCase.description,ok:false,crashed:false,responsive:false,elapsedMs:0,requests:[]};
  try{
    browser=await webkit.launch({headless:true});
    context=await browser.newContext({...iphone,locale:'es-MX',javaScriptEnabled:testCase.javaScriptEnabled});
    if(SESSION_TOKEN){
      await context.addCookies([{name:'hector_session',value:SESSION_TOKEN,domain:base.hostname,path:'/',secure:base.protocol==='https:',httpOnly:true,sameSite:'Lax'}]);
    }
    page=await context.newPage();
    page.setDefaultTimeout(4000);
    page.on('crash',()=>{result.crashed=true;});
    page.on('requestfinished',req=>{if(req.resourceType()==='script')result.requests.push(scriptName(req));});
    await page.route('**/*',route=>{
      const req=route.request();
      const url=req.url();
      if(url.startsWith('about:')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
      let parsed;try{parsed=new URL(url);}catch{return route.continue();}
      if(parsed.origin!==base.origin)return route.abort('blockedbyclient');
      if(testCase.block(req))return route.abort('blockedbyclient');
      return route.continue();
    });
    const response=await page.goto(target,{waitUntil:'commit',timeout:15000});
    result.documentStatus=response?.status?.()??null;
    await sleep(10000);
    if(result.crashed)throw new Error('page crash event');
    const state=await Promise.race([
      page.evaluate(()=>({title:document.title,readyState:document.readyState,bodyLength:(document.body?.innerText||'').trim().length,htmlLength:document.documentElement?.outerHTML?.length||0})),
      sleep(4000).then(()=>{throw new Error('state evaluation timeout');})
    ]);
    result.state=state;
    result.responsive=true;
    result.ok=true;
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    result.error=message;
    if(/crash|Target closed|Target crashed|page crash/i.test(message))result.crashed=true;
  }finally{
    result.elapsedMs=Date.now()-started;
    await context?.close().catch(()=>{});
    await closeBounded(browser);
  }
  console.log(`${result.ok?'✅':'❌'} diagnostic ${testCase.id}: ${JSON.stringify(result)}`);
  return result;
}

const results=[];
for(const testCase of cases)results.push(await runCase(testCase));
const report={auditedAt:new Date().toISOString(),target,orderedScripts,results};
await writeFile(`${OUT_DIR}/webkit-crash-diagnostic.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
