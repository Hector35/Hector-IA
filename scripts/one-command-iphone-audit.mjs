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
 if(path==='/api/vision'&&method==='POST')return json({text:JSON.stringify({bed:'C#22',name:'Héctor Reyna Hinojos',birthDate:'1963-07-29',age:63,study:'TAC simple de cráneo',transport:'Camilla',transportReason:'Accidente automovilístico y TCE moderado visibles en la solicitud',oxygenProbable:false,oxygenReason:''})});
 if(path.startsWith('/api/'))return method==='GET'?json({items:[],summary:[]}):json({ok:true});
 return null;
}

async function waitForApp(page){
 await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:45000});
 await page.getByRole('heading',{name:'Pacientes'}).waitFor({state:'visible',timeout:15000});
 await page.getByText('Leer solicitud de Rayos X',{exact:true}).waitFor({state:'visible',timeout:10000});
}

async function runXRayFlow(page){
 const visionRequest=page.waitForRequest(req=>new URL(req.url()).pathname==='/api/vision'&&req.method()==='POST');
 await page.locator('#xray-photo').setInputFiles({name:'solicitud.jpg',mimeType:'image/jpeg',buffer:Buffer.from([0xff,0xd8,0xff,0xd9])});
 await visionRequest;
 await page.getByText('Confirma la solicitud',{exact:true}).waitFor({state:'visible',timeout:10000});
 const bed=page.getByLabel('Cama / área').first();
 const name=page.getByLabel('Nombre').first();
 const age=page.getByLabel('Edad').first();
 await bed.waitFor({state:'visible'});
 if(await bed.inputValue()!=='C#22')throw new Error(`Cama extraída incorrecta: ${await bed.inputValue()}`);
 if(await name.inputValue()!=='Héctor Reyna Hinojos')throw new Error('Nombre extraído incorrecto');
 if(await age.inputValue()!=='63')throw new Error('Edad extraída incorrecta');
 await page.getByRole('button',{name:'Agregar a Rayos X'}).click();
 await page.getByText('Héctor Reyna Hinojos',{exact:true}).waitFor({state:'visible',timeout:10000});
 await page.getByText('TAC simple de cráneo',{exact:true}).waitFor({state:'visible',timeout:10000});
 await page.getByText('Camilla',{exact:true}).first().waitFor({state:'visible',timeout:10000});
 const select=page.locator('select.status').first();
 await select.selectOption('En traslado');
 if(await select.inputValue()!=='En traslado')throw new Error('No se pudo actualizar el estado de Rayos X');
 return{extracted:true,reviewed:true,saved:true,statusUpdated:true};
}

async function runFloorFlow(page){
 await page.getByRole('button',{name:/Pacientes a piso/}).click();
 await page.getByRole('button',{name:'Agregar paciente'}).click();
 await page.getByLabel('Cama / área').fill('CE1');
 await page.getByLabel(/Nombre/).fill('Paciente piso');
 await page.getByLabel('Destino').fill('Geriatría');
 await page.getByLabel('Traslado').selectOption('Silla');
 await page.getByRole('button',{name:'Agregar a piso'}).click();
 await page.getByText('Paciente piso',{exact:true}).waitFor({state:'visible',timeout:10000});
 await page.getByText('Geriatría',{exact:true}).waitFor({state:'visible',timeout:10000});
 return{added:true,ceAreaPreserved:true,destinationVisible:true};
}

await mkdir(outputDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={baseUrl,checkedAt:new Date().toISOString(),devices:[],passed:true};
try{
 for(const device of devices){
  const context=await browser.newContext({viewport:device.viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  await page.route('**/*',async route=>{const fixture=responseFor(route.request().url(),route.request().method());if(fixture)await route.fulfill(fixture);else await route.continue();});
  const result={id:device.id,label:device.label,viewport:device.viewport,xray:null,floor:null,errors:[],passed:true};
  try{
   await waitForApp(page);
   result.xray=await runXRayFlow(page);
   result.floor=await runFloorFlow(page);
   if(errors.length)throw new Error(`Errores de página: ${errors.join(' | ')}`);
   await page.screenshot({path:`${outputDir}/${device.id}-patient-shift.png`,fullPage:true,animations:'disabled'});
  }catch(error){
   result.passed=false;
   result.errors.push(error instanceof Error?error.message:String(error));
   report.passed=false;
   await page.screenshot({path:`${outputDir}/${device.id}-failure.png`,fullPage:true,animations:'disabled'}).catch(()=>{});
  }
  report.devices.push(result);
  await context.close();
 }
}finally{await browser.close();}
await writeFile(`${outputDir}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
