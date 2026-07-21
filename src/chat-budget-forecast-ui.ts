export type ForecastTier='fast'|'balanced'|'deep';
export type ForecastPlan={tier:ForecastTier;passes:1|3;explicitHigh:boolean;task:string};

const deepSignals=/\b(programa|código|codigo|arquitectura|depura|debug|audita|implementa|refactoriza|investiga|estrategia|modelo completo|razonamiento alto|máximo razonamiento|maximo razonamiento)\b/i;
const sensitiveSignals=/\b(salud|médic|medic|dolor|síntoma|sintoma|dosis|cirugía|cirugia|legal|demanda|finanzas|dinero|saldo|banco|seguridad|vulnerabilidad|contraseña|password|token|secreto)\b/i;
const fastSignals=/^(hola|gracias|ok|sí|si|no|resume|traduce|corrige|cuánto|cuanto)\b/i;

export function forecastPlan(prompt:string):ForecastPlan{
 const text=prompt.trim(),explicitHigh=/\b(razonamiento alto|máximo razonamiento|maximo razonamiento|más inteligente|mas inteligente)\b/i.test(text),deep=deepSignals.test(text)||text.length>=700,sensitive=sensitiveSignals.test(text);
 const tier:ForecastTier=deep?'deep':text.length<120&&fastSignals.test(text)?'fast':'balanced';
 const passes:1|3=(deep&&(text.length>=220||explicitHigh)||sensitive&&text.length>=180)?3:1;
 const task=/\b(código|codigo|arquitectura|debug|worker|github|api|sql|d1|r2)\b/i.test(text)?'ingeniería de software':sensitive?'tarea sensible':'consulta general';
 return{tier,passes,explicitHigh,task};
}

function money(value:unknown){const amount=Number(value||0);return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:3,maximumFractionDigits:3}).format(Number.isFinite(amount)?amount:0);}
function findComposer(){return document.querySelector<HTMLFormElement>('.cxComposer');}

export function installChatBudgetForecastEnhancer(){
 let composer:HTMLFormElement|undefined,textarea:HTMLTextAreaElement|undefined,bar:HTMLElement|undefined,timer:number|undefined,controller:AbortController|undefined,lastPrompt='';
 const clear=()=>{if(timer)window.clearTimeout(timer);timer=undefined;controller?.abort();controller=undefined;if(bar){bar.textContent='';bar.className='cxChatForecast';}};
 const render=(text:string,state='')=>{if(!bar)return;bar.className=`cxChatForecast ${state}`;bar.textContent=text;};
 const request=async(prompt:string)=>{
  const plan=forecastPlan(prompt);controller?.abort();controller=new AbortController();render('Calculando modelo, costo y saldo…','loading');
  try{
   const response=await fetch('/api/intelligence/budget/forecast',{method:'POST',credentials:'include',signal:controller.signal,headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({prompt,task:plan.task,tier:plan.tier,contextChars:0,passes:plan.passes,explicitHigh:plan.explicitHigh})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Pronóstico no disponible');if(prompt!==textarea?.value.trim())return;
   const forecast=data.forecast||{},projection=forecast.projection||{},action=String(forecast.action||'allow'),protectedTask=Boolean(data.protected),model=String(projection.model||data.model||plan.tier),passes=Number(projection.passes||plan.passes),cost=money(projection.estimatedCostUsd),remaining=money(Math.min(Number(projection.dailyRemainingAfterUsd??Infinity),Number(projection.monthlyRemainingAfterUsd??Infinity))),degraded=action==='degrade';
   const status=degraded?'Protección: ruta reducida':protectedTask?'Calidad protegida':action==='allow-protected'?'Excepción protegida':'Dentro del presupuesto';
   render(`${model} · ${passes} pasada${passes===1?'':'s'} · ~${cost} · saldo posterior ${remaining} · ${status}`,degraded?'warning':protectedTask?'protected':'good');
  }catch(error){if((error as Error).name==='AbortError')return;render(error instanceof Error?error.message:'Pronóstico no disponible','error');}
 };
 const onInput=()=>{const prompt=textarea?.value.trim()||'';lastPrompt=prompt;if(timer)window.clearTimeout(timer);if(prompt.length<3){clear();return;}render('Preparando pronóstico…','loading');timer=window.setTimeout(()=>{if(prompt===lastPrompt)void request(prompt);},450);};
 const mount=(form:HTMLFormElement)=>{if(form.dataset.budgetForecastReady==='1')return;form.dataset.budgetForecastReady='1';composer=form;textarea=form.querySelector('textarea')||undefined;if(!textarea)return;bar=document.createElement('div');bar.className='cxChatForecast';bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');form.insertAdjacentElement('beforebegin',bar);textarea.addEventListener('input',onInput);form.addEventListener('submit',clear);onInput();};
 const scan=()=>{const next=findComposer();if(next&&next!==composer)mount(next);if(composer&&!document.body.contains(composer)){clear();composer=undefined;textarea=undefined;bar=undefined;}};
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});scan();
 return()=>{observer.disconnect();clear();textarea?.removeEventListener('input',onInput);};
}
