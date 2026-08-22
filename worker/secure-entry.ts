import {Hono} from 'hono';
import worker from './index';
import type {Bindings,Variables} from './types';
import {hectorBridge} from './routes/hector-bridge';
import {evaluateSecurityBoundary,isProtectedMutation,normalizeRequestId} from './lib/security-boundary';

const HECTOR_AGENT_VERSION='20260822-4';
const bridgeApi=new Hono<{Bindings:Bindings;Variables:Variables}>();
bridgeApi.route('/api/hector-bridge',hectorBridge);

function securedResponse(response:Response,pathname:string,requestId:string){
 const secured=new Response(response.body,response);
 secured.headers.set('X-Request-ID',requestId);
 secured.headers.set('Referrer-Policy','no-referrer');
 secured.headers.set('Cross-Origin-Opener-Policy','same-origin');
 secured.headers.set('Cross-Origin-Resource-Policy','same-origin');
 secured.headers.set('X-Content-Type-Options','nosniff');
 secured.headers.set('X-Frame-Options','DENY');
 secured.headers.set('Strict-Transport-Security','max-age=63072000; includeSubDomains; preload');
 secured.headers.set('Permissions-Policy','camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()');
 if(['/api/','/control/','/runner/','/self-improve/','/generated/','/agent/','/hector-agent'].some(prefix=>pathname.startsWith(prefix))||pathname==='/agent'){
  secured.headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  secured.headers.set('Pragma','no-cache');
  secured.headers.set('Expires','0');
 }
 return secured;
}

async function serveHectorAgentShell(request:Request,env:Bindings,pathname:string,requestId:string){
 const assetUrl=new URL(request.url);
 assetUrl.pathname='/agent/index.html';
 assetUrl.search='';
 const response=await env.ASSETS.fetch(new Request(assetUrl.toString(),request));
 if(!response.ok){
  return securedResponse(new Response('Héctor Agent shell unavailable',{status:502,headers:{'Content-Type':'text/plain; charset=utf-8'}}),pathname,requestId);
 }
 const secured=securedResponse(response,pathname,requestId);
 secured.headers.set('X-Hector-Agent-Version',HECTOR_AGENT_VERSION);
 return secured;
}

export default {
 async fetch(request:Request,env:Bindings,ctx:ExecutionContext){
  const url=new URL(request.url),requestId=normalizeRequestId(request.headers.get('X-Request-ID'));
  if(url.pathname==='/hector-agent'||url.pathname==='/hector-agent/'||url.pathname==='/agent'){
   const redirectUrl=new URL(request.url);
   redirectUrl.pathname='/agent/index.html';
   redirectUrl.search='';
   redirectUrl.searchParams.set('v',HECTOR_AGENT_VERSION);
   return securedResponse(Response.redirect(redirectUrl.toString(),307),url.pathname,requestId);
  }
  if(url.pathname==='/agent/'||url.pathname==='/agent/index.html'){
   return serveHectorAgentShell(request,env,url.pathname,requestId);
  }
  if(isProtectedMutation(url.pathname,request.method)){
   const decision=evaluateSecurityBoundary({url:request.url,method:request.method,origin:request.headers.get('Origin'),secFetchSite:request.headers.get('Sec-Fetch-Site')});
   if(!decision.allowed){
    const body=JSON.stringify({error:'Solicitud entre sitios bloqueada',code:'cross_site_mutation_denied',requestId});
    return securedResponse(new Response(body,{status:403,headers:{'Content-Type':'application/json; charset=utf-8'}}),url.pathname,requestId);
   }
  }
  const headers=new Headers(request.headers);headers.set('X-Request-ID',requestId);
  const response=url.pathname.startsWith('/api/hector-bridge')
   ?await bridgeApi.fetch(new Request(request,{headers}),env,ctx)
   :await worker.fetch(new Request(request,{headers}),env,ctx);
  return securedResponse(response,url.pathname,requestId);
 },
 scheduled:worker.scheduled
};