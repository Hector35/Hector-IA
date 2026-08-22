import {Hono} from 'hono';
import {z} from 'zod';
import type {Bindings,Variables} from '../types';
import {authHasScope,requireAuth} from '../lib/auth';
import {sha256} from '../lib/crypto';
import {credentialBrokerAvailable,storeCredentialMaterial} from '../lib/credential-broker';

export const hectorAccess=new Hono<{Bindings:Bindings;Variables:Variables}>();
hectorAccess.use('*',requireAuth);

const tokenSchema=z.object({name:z.string().trim().min(2).max(120).default('Héctor MCP'),scopes:z.array(z.enum(['mcp','context','tools','jobs','bridge','*'])).min(1).max(10).default(['mcp','context','tools','jobs','bridge']),expiresDays:z.number().int().min(1).max(3650).nullable().default(365)});
const credentialSchema=z.object({
  provider:z.string().trim().min(2).max(100),authType:z.enum(['oauth','service_account','api_token','github_app','connector','none']),
  secret:z.unknown().optional(),secretRef:z.string().trim().min(3).max(300).optional(),scopes:z.array(z.string().trim().min(1).max(180)).max(100).default([]),
  refreshable:z.boolean().default(false),expiresAt:z.string().datetime({offset:true}).nullable().default(null),metadata:z.record(z.string(),z.unknown()).default({})
}).refine(v=>v.authType==='none'||v.secret!==undefined||Boolean(v.secretRef),{message:'Indica secret o secretRef para una credencial autenticada'});

function sessionOnly(c:any){return c.get('authMethod')==='session';}
function randomToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));let binary='';for(const value of bytes)binary+=String.fromCharCode(value);return`htr_${btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`;}
function publicCredential(row:any){return{id:row.id,provider:row.provider,authType:row.auth_type,secretRef:String(row.secret_ref||'').startsWith('encrypted:')?'encrypted':row.secret_ref,scopes:JSON.parse(row.scopes_json||'[]'),status:row.status,refreshable:Boolean(row.refreshable),expiresAt:row.expires_at,lastVerifiedAt:row.last_verified_at,metadata:JSON.parse(row.metadata_json||'{}'),createdAt:row.created_at,updatedAt:row.updated_at};}

hectorAccess.get('/status',c=>c.json({ok:true,machineTokens:true,credentialBroker:{encrypted:credentialBrokerAvailable(c.env),keySource:c.env.HECTOR_CREDENTIAL_KEY?'HECTOR_CREDENTIAL_KEY':c.env.REMOTE_CONTROL_TOKEN?'REMOTE_CONTROL_TOKEN fallback':'unconfigured'},authMethod:c.get('authMethod'),scopes:c.get('authScopes')||[]}));

hectorAccess.get('/tokens',async c=>{
  if(!sessionOnly(c)&&!authHasScope(c,'bridge'))return c.json({error:'Scope bridge requerido'},403);
  const rows=await c.env.DB.prepare('SELECT id,name,scopes_json,expires_at,last_used_at,revoked_at,created_at,updated_at FROM external_access_tokens WHERE user_id=? ORDER BY created_at DESC').bind(c.get('userId')).all<any>();
  return c.json({items:(rows.results||[]).map((x:any)=>({...x,scopes:JSON.parse(x.scopes_json||'[]')}))});
});

hectorAccess.post('/tokens',async c=>{
  if(!sessionOnly(c))return c.json({error:'Los tokens de máquina solo se emiten desde una sesión interactiva autenticada'},403);
  const parsed=tokenSchema.safeParse(await c.req.json().catch(()=>({})));if(!parsed.success)return c.json({error:'Token inválido',details:parsed.error.flatten()},400);
  const raw=randomToken(),hash=await sha256(raw),id=crypto.randomUUID(),expiresAt=parsed.data.expiresDays?new Date(Date.now()+parsed.data.expiresDays*86400000).toISOString():null;
  await c.env.DB.prepare('INSERT INTO external_access_tokens(id,user_id,name,token_hash,scopes_json,expires_at) VALUES(?,?,?,?,?,?)').bind(id,c.get('userId'),parsed.data.name,hash,JSON.stringify(parsed.data.scopes),expiresAt).run();
  return c.json({id,name:parsed.data.name,token:raw,scopes:parsed.data.scopes,expiresAt,warning:'El token se devuelve una sola vez; guárdalo como secreto, no en código ni logs.'},201);
});

hectorAccess.delete('/tokens/:id',async c=>{
  if(!sessionOnly(c))return c.json({error:'Solo una sesión interactiva puede revocar tokens'},403);
  const result=await c.env.DB.prepare('UPDATE external_access_tokens SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND revoked_at IS NULL').bind(c.req.param('id'),c.get('userId')).run();
  return c.json({ok:true,revoked:Number(result.meta.changes||0)>0});
});

hectorAccess.get('/credentials',async c=>{
  if(!sessionOnly(c)&&!authHasScope(c,'tools'))return c.json({error:'Scope tools requerido'},403);
  const rows=await c.env.DB.prepare('SELECT * FROM hector_agent_credentials WHERE user_id=? ORDER BY provider,updated_at DESC').bind(c.get('userId')).all<any>();
  return c.json({items:(rows.results||[]).map(publicCredential),brokerAvailable:credentialBrokerAvailable(c.env)});
});

hectorAccess.post('/credentials',async c=>{
  if(!sessionOnly(c))return c.json({error:'Las credenciales solo se configuran desde una sesión interactiva autenticada'},403);
  const parsed=credentialSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:'Credencial inválida',details:parsed.error.flatten()},400);
  const v=parsed.data,id=crypto.randomUUID();
  if(v.secret!==undefined&&!credentialBrokerAvailable(c.env))return c.json({error:'El almacenamiento cifrado no está configurado. Define HECTOR_CREDENTIAL_KEY o REMOTE_CONTROL_TOKEN como secreto del Worker.'},503);
  const secretRef=v.secret!==undefined?`encrypted:${id}`:(v.secretRef||'none');
  await c.env.DB.prepare(`INSERT INTO hector_agent_credentials(id,user_id,provider,auth_type,secret_ref,scopes_json,status,refreshable,expires_at,metadata_json,last_verified_at)
    VALUES(?,?,?,?,?,?,'ready',?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,c.get('userId'),v.provider,v.authType,secretRef,JSON.stringify(v.scopes),Number(v.refreshable),v.expiresAt,JSON.stringify(v.metadata)).run();
  if(v.secret!==undefined)await storeCredentialMaterial(c.env,c.get('userId'),id,v.secret);
  const row=await c.env.DB.prepare('SELECT * FROM hector_agent_credentials WHERE id=? AND user_id=?').bind(id,c.get('userId')).first<any>();
  return c.json({credential:publicCredential(row),secretStored:v.secret!==undefined},201);
});

hectorAccess.delete('/credentials/:id',async c=>{
  if(!sessionOnly(c))return c.json({error:'Solo una sesión interactiva puede revocar credenciales'},403);
  const id=c.req.param('id');
  await c.env.DB.prepare('DELETE FROM hector_credential_secret_blobs WHERE credential_id=? AND user_id=?').bind(id,c.get('userId')).run();
  const result=await c.env.DB.prepare("UPDATE hector_agent_credentials SET status='revoked',secret_ref='revoked',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(id,c.get('userId')).run();
  return c.json({ok:true,revoked:Number(result.meta.changes||0)>0});
});
