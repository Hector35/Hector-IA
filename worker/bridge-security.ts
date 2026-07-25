import {secureHeaders} from 'hono/secure-headers';

const standardSecurity=secureHeaders({contentSecurityPolicy:{defaultSrc:["'self'"],connectSrc:["'self'"],imgSrc:["'self'",'data:'],styleSrc:["'self'","'unsafe-inline'"]}});
const bridgePaths=new Set(['/bridge.html','/bridge.js','/bridge.css','/bridge-code-worker.mjs']);
const bridgePolicy="default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval' https://cdn.jsdelivr.net; connect-src https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; child-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

export async function bridgeSecurity(c:any,next:()=>Promise<void>){
 const path=new URL(c.req.url).pathname;
 if(!bridgePaths.has(path))return standardSecurity(c,next);
 await next();
 c.header('Content-Security-Policy',bridgePolicy);
 c.header('Permissions-Policy','microphone=(self), geolocation=(self), camera=()');
 c.header('Referrer-Policy','no-referrer');
 c.header('X-Content-Type-Options','nosniff');
}
