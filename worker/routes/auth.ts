import {Hono} from 'hono';
import {deleteCookie,getCookie,setCookie} from 'hono/cookie';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {hashPassword,randomToken,sha256,verifyPassword} from '../lib/crypto';
import {requireAuth} from '../lib/auth';

export const auth=new Hono<{Bindings:Bindings;Variables:Variables}>();
const credentials=z.object({email:z.string().email(),password:z.string().min(10).max(128),name:z.string().min(2).max(60).optional()});
const MAX_FAILURES=5,WINDOW_MS=15*60_000,BLOCK_MS=15*60_000;
const cookie=(c:any,token:string)=>setCookie(c,'hector_session',token,{httpOnly:true,secure:true,sameSite:'Strict',path:'/',maxAge:60*60*24*30});

function requestIp(c:any){return (c.req.header('CF-Connecting-IP')||c.req.header('X-Forwarded-For')||'unknown').split(',')[0].trim();}
async function requestIdentity(c:any,email:string){return sha256(`${requestIp(c)}|${email.toLowerCase()}`);}
async function requestIpHash(c:any){return sha256(requestIp(c));}
function userAgent(c:any){return (c.req.header('User-Agent')||'unknown').slice(0,300);}

export function rateLimitDecision(row:{failures:number;window_started_at:string;blocked_until?:string|null}|null,now=Date.now()){
 if(!row)return {blocked:false,failures:0};
 const blockedUntil=row.blocked_until?Date.parse(row.blocked_until):0;
 if(Number.isFinite(blockedUntil)&&blockedUntil>now)return {blocked:true,failures:row.failures,retryAfterSeconds:Math.ceil((blockedUntil-now)/1000)};
 const windowStarted=Date.parse(row.window_started_at);
 if(!Number.isFinite(windowStarted)||now-windowStarted>WINDOW_MS)return {blocked:false,failures:0};
 return {blocked:false,failures:row.failures};
}

async function enforceRateLimit(c:any,email:string){
 const key=await requestIdentity(c,email),row=await c.env.DB.prepare('SELECT failures,window_started_at,blocked_until FROM auth_rate_limits WHERE key_hash=?').bind(key).first<any>();
 return {key,...rateLimitDecision(row)};
}
async function recordFailure(c:any,key:string,currentFailures:number){
 const failures=currentFailures+1,blockedUntil=failures>=MAX_FAILURES?new Date(Date.now()+BLOCK_MS).toISOString():null;
 await c.env.DB.prepare(`INSERT INTO auth_rate_limits(key_hash,failures,window_started_at,blocked_until,updated_at) VALUES(?,?,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP)
 ON CONFLICT(key_hash) DO UPDATE SET failures=?,window_started_at=CASE WHEN julianday('now')-julianday(window_started_at) > ? THEN CURRENT_TIMESTAMP ELSE window_started_at END,blocked_until=?,updated_at=CURRENT_TIMESTAMP`).bind(key,failures,blockedUntil,failures,WINDOW_MS/86_400_000,blockedUntil).run();
 return blockedUntil;
}
async function clearFailures(c:any,key:string){await c.env.DB.prepare('DELETE FROM auth_rate_limits WHERE key_hash=?').bind(key).run();}
async function createSession(c:any,userId:string){
 const token=randomToken(),tokenHash=await sha256(token),ipHash=await requestIpHash(c);
 await c.env.DB.batch([
  c.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')"),
  c.env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at,last_seen_at,user_agent,ip_hash) VALUES(?,?,?,datetime('now','+30 days'),CURRENT_TIMESTAMP,?,?)").bind(crypto.randomUUID(),userId,tokenHash,userAgent(c),ipHash)
 ]);
 cookie(c,token);return token;
}

auth.post('/register',async c=>{
 const parsed=credentials.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Datos inválidos',details:parsed.error.flatten()},400);
 const id=crypto.randomUUID(),{hash,salt}=await hashPassword(parsed.data.password),token=randomToken(),tokenHash=await sha256(token),ipHash=await requestIpHash(c);
 try{
  await c.env.DB.batch([
   c.env.DB.prepare('INSERT INTO users(id,email,name,password_hash,password_salt) VALUES(?,?,?,?,?)').bind(id,parsed.data.email.toLowerCase(),parsed.data.name||'Héctor',hash,salt),
   c.env.DB.prepare('INSERT INTO owner_registration(singleton,user_id) VALUES(1,?)').bind(id),
   c.env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at,last_seen_at,user_agent,ip_hash) VALUES(?,?,?,datetime('now','+30 days'),CURRENT_TIMESTAMP,?,?)").bind(crypto.randomUUID(),id,tokenHash,userAgent(c),ipHash)
  ]);
 }catch{return c.json({error:'El propietario ya fue registrado'},409);}
 cookie(c,token);return c.json({user:{id,name:parsed.data.name||'Héctor'}});
});

auth.post('/login',async c=>{
 const parsed=credentials.safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Credenciales inválidas'},400);
 const limit=await enforceRateLimit(c,parsed.data.email);
 if(limit.blocked){c.header('Retry-After',String(limit.retryAfterSeconds||900));return c.json({error:'Demasiados intentos. Intenta más tarde.'},429);}
 const u=await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(parsed.data.email.toLowerCase()).first<any>();
 if(!u||!await verifyPassword(parsed.data.password,u.password_salt,u.password_hash)){
  const blockedUntil=await recordFailure(c,limit.key,limit.failures);
  if(blockedUntil){c.header('Retry-After',String(Math.ceil(BLOCK_MS/1000)));return c.json({error:'Credenciales inválidas'},429);}
  return c.json({error:'Credenciales inválidas'},401);
 }
 await clearFailures(c,limit.key);await createSession(c,u.id);return c.json({user:{id:u.id,name:u.name}});
});

auth.post('/logout',requireAuth,async c=>{const raw=getCookie(c,'hector_session');if(raw)await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(raw)).run();deleteCookie(c,'hector_session',{path:'/'});return c.json({ok:true})});
auth.post('/logout-all',requireAuth,async c=>{await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(c.get('userId')).run();deleteCookie(c,'hector_session',{path:'/'});return c.json({ok:true})});
auth.get('/sessions',requireAuth,async c=>{const raw=getCookie(c,'hector_session'),currentHash=raw?await sha256(raw):'';const rows=(await c.env.DB.prepare("SELECT id,token_hash,created_at,expires_at,last_seen_at,user_agent FROM sessions WHERE user_id=? AND expires_at>datetime('now') ORDER BY created_at DESC").bind(c.get('userId')).all<any>()).results;return c.json({items:rows.map(({token_hash,...x}:any)=>({...x,current:token_hash===currentHash}))})});
auth.delete('/sessions/:id',requireAuth,async c=>{const id=c.req.param('id');const raw=getCookie(c,'hector_session'),currentHash=raw?await sha256(raw):'';const target=await c.env.DB.prepare('SELECT token_hash FROM sessions WHERE id=? AND user_id=?').bind(id,c.get('userId')).first<any>();if(!target)return c.json({error:'Sesión no encontrada'},404);await c.env.DB.prepare('DELETE FROM sessions WHERE id=? AND user_id=?').bind(id,c.get('userId')).run();if(target.token_hash===currentHash)deleteCookie(c,'hector_session',{path:'/'});return c.json({ok:true,currentRevoked:target.token_hash===currentHash})});
auth.get('/me',requireAuth,async c=>{const raw=getCookie(c,'hector_session');if(raw)await c.env.DB.prepare("UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=? AND (last_seen_at IS NULL OR last_seen_at<datetime('now','-5 minutes'))").bind(await sha256(raw)).run();return c.json({user:{id:c.get('userId'),name:c.get('userName')}})});
