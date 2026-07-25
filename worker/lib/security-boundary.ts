import type {MiddlewareHandler} from 'hono';
import type {Bindings,Variables} from '../types';

const UNSAFE=new Set(['POST','PUT','PATCH','DELETE']);
const PROTECTED_PREFIXES=['/api/','/control/','/runner/','/self-improve/','/generated/'];
const REQUEST_ID=/^[A-Za-z0-9._:-]{8,128}$/;

export type BoundaryInput={url:string;method:string;origin?:string|null;secFetchSite?:string|null};
export type BoundaryDecision={allowed:boolean;reason:'safe-method'|'same-origin'|'server-client'|'cross-origin'|'cross-site';requestOrigin:string;targetOrigin:string};

export function isProtectedMutation(pathname:string,method:string){return UNSAFE.has(method.toUpperCase())&&PROTECTED_PREFIXES.some(prefix=>pathname.startsWith(prefix));}

export function evaluateSecurityBoundary(input:BoundaryInput):BoundaryDecision{
 const targetOrigin=new URL(input.url).origin,method=input.method.toUpperCase();
 if(!UNSAFE.has(method))return{allowed:true,reason:'safe-method',requestOrigin:input.origin||'',targetOrigin};
 const site=(input.secFetchSite||'').toLowerCase();
 if(site==='cross-site')return{allowed:false,reason:'cross-site',requestOrigin:input.origin||'',targetOrigin};
 if(!input.origin)return{allowed:true,reason:'server-client',requestOrigin:'',targetOrigin};
 let requestOrigin='';try{requestOrigin=new URL(input.origin).origin}catch{return{allowed:false,reason:'cross-origin',requestOrigin:input.origin,targetOrigin}};
 if(requestOrigin!==targetOrigin)return{allowed:false,reason:'cross-origin',requestOrigin,targetOrigin};
 return{allowed:true,reason:'same-origin',requestOrigin,targetOrigin};
}

export function normalizeRequestId(value:unknown){const candidate=String(value||'').trim();return REQUEST_ID.test(candidate)?candidate:crypto.randomUUID();}

export const SECURITY_BOUNDARY_MANIFEST={
 version:'1.0.0',
 protectedMethods:[...UNSAFE],
 protectedPrefixes:PROTECTED_PREFIXES,
 crossSiteMutations:'deny',
 sameOriginMutations:'allow',
 serverClientsWithoutOrigin:'allow',
 apiCache:'no-store',
 hstsSeconds:63072000,
 frameEmbedding:'deny',
 referrerPolicy:'no-referrer',
 requestId:true
} as const;

export const securityBoundary:MiddlewareHandler<{Bindings:Bindings;Variables:Variables}>=async(c,next)=>{
 const url=new URL(c.req.url),requestId=normalizeRequestId(c.req.header('X-Request-ID'));
 c.header('X-Request-ID',requestId);
 if(isProtectedMutation(url.pathname,c.req.method)){
  const decision=evaluateSecurityBoundary({url:c.req.url,method:c.req.method,origin:c.req.header('Origin'),secFetchSite:c.req.header('Sec-Fetch-Site')});
  if(!decision.allowed)return c.json({error:'Solicitud entre sitios bloqueada',code:'cross_site_mutation_denied',requestId},403);
 }
 await next();
 c.header('Referrer-Policy','no-referrer');
 c.header('Cross-Origin-Opener-Policy','same-origin');
 c.header('Cross-Origin-Resource-Policy','same-origin');
 c.header('X-Content-Type-Options','nosniff');
 c.header('X-Frame-Options','DENY');
 c.header('Strict-Transport-Security','max-age=63072000; includeSubDomains; preload');
 c.header('Permissions-Policy','camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()');
 if(PROTECTED_PREFIXES.some(prefix=>url.pathname.startsWith(prefix))){c.header('Cache-Control','no-store, max-age=0');c.header('Pragma','no-cache');}
};
