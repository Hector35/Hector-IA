import {Hono} from 'hono';
import {deleteCookie,getCookie,setCookie} from 'hono/cookie';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {hashPassword,randomToken,sha256,verifyPassword} from '../lib/crypto';
import {AUTH_WINDOW_MS,rateLimitDecision} from '../lib/auth-rate-limit';
import {requireAuth} from '../lib/auth';
import {TEST_ACCOUNT_EMAIL,TEST_ACCOUNT_NAME,canProvisionTestAccount,classifyAccountRole,type AccountRole} from '../lib/test-account';

export const auth=new Hono<{Bindings:Bindings;Variables:Variables}>();
const credentials=z.object({email:z.string().email(),password:z.string().min(10).max(128),name:z.string().min(2).max(60).optional()});
const MAX_FAILURES=5,BLOCK_MS=15*60_000;
const cookie=(c:any,token:string)=>setCookie(c,'hector_session',token,{httpOnly:true,secure:true,sameSite:'Strict',path:'/',maxAge:60*60*24*30});

type RateRow={failures:number;window_started_at:string;blocked_until:string|null};
type UserRow={id:string;name:string;password_salt:string;password_hash:string};
type SessionRow={id:string;token_hash:string;created_at:string;expires_at:string;last_seen_at:string|null;user_agent:string|null};
type TestUser={id:string;name:string};
type AccountContext={role:AccountRole;email:string|null;ownerUserId:string|null};

function requestIp(c:any){return (c.req.header('CF-Connecting-IP')||c.req.header('X-Forwarded-For')||'unknown').split(',')[0].trim();}
async function requestIdentity(c:any,email:string){return sha256(`${requestIp(c)}|${email.toLowerCase()}`);}
async function requestIpHash(c:any){return sha256(requestIp(c));}
function userAgent(c:any){return (c.req.header('User-Agent')||'unknown').slice(0,300);}

async function enforceRateLimit(c:any,email:string){
 const key=await requestIdentity(c,email);
 const row=await c.env.DB.prepare('SELECT failures,window_started_at,blocked_until FROM auth_rate_limits WHERE key_hash=?').bind(key).first() as RateRow|null;
 return {key,decision:rateLimitDecision(row)};
}
async function recordFailure(c:any,key:string,currentFailures:number):Promise<boolean>{
 const failures=currentFailures+1,blockedUntil=failures>=MAX_FAILURES?new Date(Date.now()+BLOCK_MS).toISOString():null;
 await c.env.DB.prepare(`INSERT INTO auth_rate_limits(key_hash,failures,window_started_at,blocked_until,updated_at) VALUES(?,?,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP)
 ON CONFLICT(key_hash) DO UPDATE SET failures=?,window_started_at=CASE WHEN julianday('now')-julianday(window_started_at) > ? THEN CURRENT_TIMESTAMP ELSE window_started_at END,blocked_until=?,updated_at=CURRENT_TIMESTAMP`).bind(key,failures,blockedUntil,failures,AUTH_WINDOW_MS/86_400_000,blockedUntil).run();
 return blockedUntil!==null;
}
async function clearFailures(c:any,key:string){await c.env.DB.prepare('DELETE FROM auth_rate_limits WHERE key_hash=?').bind(key).run();}
async function createSession(c:any,userId:string){
 const token=randomToken(),tokenHash=await sha256(token),ipHash=await requestIpHash(c);
 await c.env.DB.batch([
  c.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')"),
  c.env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at,last_seen_at,user_agent,ip_hash) VALUES(?,?,?,datetime('now','+30 days'),CURRENT_TIMESTAMP,?,?)").bind(crypto.randomUUID(),userId,tokenHash,userAgent(c),ipHash)
 ]);
 cookie(c,token);
}
async function findTestAccount(db:D1Database){return db.prepare('SELECT id,name FROM users WHERE email=?').bind(TEST_ACCOUNT_EMAIL).first<TestUser>();}
async function ensureTestAccount(db:D1Database):Promise<TestUser>{
 const existing=await findTestAccount(db);if(existing)return existing;
 const id=crypto.randomUUID(),unusablePassword=randomToken(48),{hash,salt}=await hashPassword(unusablePassword);
 try{await db.prepare('INSERT INTO users(id,email,name,password_hash,password_salt) VALUES(?,?,?,?,?)').bind(id,TEST_ACCOUNT_EMAIL,TEST_ACCOUNT_NAME,hash,salt).run();}
 catch(error){const raced=await findTestAccount(db);if(raced)return raced;throw error;}
 return{id,name:TEST_ACCOUNT_NAME};
}
async function loadAccountContext(db:D1Database,userId:string):Promise<AccountContext>{
 const row=await db.prepare(`SELECT u.email,(SELECT user_id FROM owner_registration WHERE singleton=1) owner_id FROM users u WHERE u.id=?`).bind(userId).first<{email:string;owner_id:string|null}>();
 const email=row?.email||null,ownerUserId=row?.owner_id||null;
 return{role:classifyAccountRole(userId,email,ownerUserId),email,ownerUserId};
}
async function recordAccountAudit(db:D1Database,userId:string,action:string,testUserId:string){
 try{await db.prepare('INSERT INTO audit_log(id,user_id,action,resource_type,resource_id,metadata_json) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,action,'test_account',testUserId,JSON.stringify({account:TEST_ACCOUNT_NAME,persistent:true,isolatedBy:'user_id'})).run();}catch{}
}

auth.post('/register',async(c:any)=>{
 const parsed=credentials.safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Datos inválidos',details:parsed.error.flatten()},400);
 const id=crypto.randomUUID(),{hash,salt}=await hashPassword(parsed.data.password),token=randomToken(),tokenHash=await sha256(token),ipHash=await requestIpHash(c);
 try{
  await c.env.DB.batch([
   c.env.DB.prepare('INSERT INTO users(id,email,name,password_hash,password_salt) VALUES(?,?,?,?,?)').bind(id,parsed.data.email.toLowerCase(),parsed.data.name||'Héctor',hash,salt),
   c.env.DB.prepare('INSERT INTO owner_registration(singleton,user_id) VALUES(1,?)').bind(id),
   c.env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at,last_seen_at,user_agent,ip_hash) VALUES(?,?,?,datetime('now','+30 days'),CURRENT_TIMESTAMP,?,?)").bind(crypto.randomUUID(),id,tokenHash,userAgent(c),ipHash)
  ]);
 }catch{return c.json({error:'El propietario ya fue registrado'},409);}
 cookie(c,token);
 return c.json({user:{id,name:parsed.data.name||'Héctor'}});
});

auth.post('/login',async(c:any)=>{
 const parsed=credentials.safeParse(await c.req.json());
 if(!parsed.success)return c.json({error:'Credenciales inválidas'},400);
 const {key,decision}=await enforceRateLimit(c,parsed.data.email);
 if(decision.blocked){c.header('Retry-After',String(decision.retryAfterSeconds??900));return c.json({error:'Demasiados intentos. Intenta más tarde.'},429);}
 const u=await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(parsed.data.email.toLowerCase()).first() as UserRow|null;
 if(!u||!await verifyPassword(parsed.data.password,u.password_salt,u.password_hash)){
  const blocked=await recordFailure(c,key,decision.failures);
  if(blocked){c.header('Retry-After',String(Math.ceil(BLOCK_MS/1000)));return c.json({error:'Credenciales inválidas'},429);}
  return c.json({error:'Credenciales inválidas'},401);
 }
 await clearFailures(c,key);
 await createSession(c,u.id);
 return c.json({user:{id:u.id,name:u.name}});
});

auth.get('/test-account/status',requireAuth,async(c:any)=>{
 const userId=c.get('userId'),context=await loadAccountContext(c.env.DB,userId);
 const account=canProvisionTestAccount(context.role)?await ensureTestAccount(c.env.DB):await findTestAccount(c.env.DB);
 if(account&&context.role==='owner')await recordAccountAudit(c.env.DB,userId,'test_account.ensure',account.id);
 return c.json({
  currentRole:context.role,
  account:account?{id:account.id,name:account.name,exists:true,persistent:true,dataIsolation:'user_id',passwordLogin:false,deletionAvailable:false}:null,
  canEnter:canProvisionTestAccount(context.role),
  returnRequiresOwnerLogin:context.role==='test'
 });
});

auth.post('/test-account/enter',requireAuth,async(c:any)=>{
 const ownerUserId=c.get('userId'),context=await loadAccountContext(c.env.DB,ownerUserId);
 if(!canProvisionTestAccount(context.role))return c.json({error:'Solo la cuenta propietaria puede abrir la cuenta de pruebas'},403);
 const account=await ensureTestAccount(c.env.DB);
 await createSession(c,account.id);
 await recordAccountAudit(c.env.DB,ownerUserId,'test_account.enter',account.id);
 return c.json({user:{id:account.id,name:account.name},accountType:'test',persistent:true,ownerSessionPreservedInDatabase:true,returnRequiresOwnerLogin:true});
});

auth.post('/logout',requireAuth,async(c:any)=>{const raw=getCookie(c,'hector_session');if(raw)await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(raw)).run();deleteCookie(c,'hector_session',{path:'/'});return c.json({ok:true});});
auth.post('/logout-all',requireAuth,async(c:any)=>{await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(c.get('userId')).run();deleteCookie(c,'hector_session',{path:'/'});return c.json({ok:true});});
auth.get('/sessions',requireAuth,async(c:any)=>{const raw=getCookie(c,'hector_session'),currentHash=raw?await sha256(raw):'';const result=await c.env.DB.prepare("SELECT id,token_hash,created_at,expires_at,last_seen_at,user_agent FROM sessions WHERE user_id=? AND expires_at>datetime('now') ORDER BY created_at DESC").bind(c.get('userId')).all();const rows=((result.results||[]) as SessionRow[]);return c.json({items:rows.map(({token_hash,...x})=>({...x,current:token_hash===currentHash}))});});
auth.delete('/sessions/:id',requireAuth,async(c:any)=>{const id=c.req.param('id');const raw=getCookie(c,'hector_session'),currentHash=raw?await sha256(raw):'';const target=await c.env.DB.prepare('SELECT token_hash FROM sessions WHERE id=? AND user_id=?').bind(id,c.get('userId')).first() as {token_hash:string}|null;if(!target)return c.json({error:'Sesión no encontrada'},404);await c.env.DB.prepare('DELETE FROM sessions WHERE id=? AND user_id=?').bind(id,c.get('userId')).run();if(target.token_hash===currentHash)deleteCookie(c,'hector_session',{path:'/'});return c.json({ok:true,currentRevoked:target.token_hash===currentHash});});
auth.get('/me',requireAuth,async(c:any)=>{const raw=getCookie(c,'hector_session');if(raw)await c.env.DB.prepare("UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=? AND (last_seen_at IS NULL OR last_seen_at<datetime('now','-5 minutes'))").bind(await sha256(raw)).run();const context=await loadAccountContext(c.env.DB,c.get('userId'));return c.json({user:{id:c.get('userId'),name:c.get('userName'),accountType:context.role}});});
