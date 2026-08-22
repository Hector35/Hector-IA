import type {Bindings} from '../types';
import {credentialState,type HectorAgentCredential} from './hector-agent-resilience';

const encoder=new TextEncoder(),decoder=new TextDecoder();

function keyMaterial(env:Bindings){
  const value=(env.HECTOR_CREDENTIAL_KEY||env.REMOTE_CONTROL_TOKEN||'').trim();
  if(!value)throw new Error('credential_broker_key_unconfigured');
  return value;
}
function parseJson<T>(value:string|null|undefined,fallback:T):T{try{return value?JSON.parse(value) as T:fallback}catch{return fallback;}}
function publicHttps(value:string){
  try{
    const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return null;
    const host=url.hostname.toLowerCase();if(host==='localhost'||host.endsWith('.local')||host==='::1'||host.startsWith('127.')||host.startsWith('10.')||host.startsWith('192.168.'))return null;
    const match=host.match(/^172\.(\d+)\./);if(match&&Number(match[1])>=16&&Number(match[1])<=31)return null;return url;
  }catch{return null;}
}

function toBase64Url(bytes:Uint8Array){
  let binary='';for(const value of bytes)binary+=String.fromCharCode(value);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromBase64Url(value:string){
  const base=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4),binary=atob(base),out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;
}
async function encryptionKey(env:Bindings){
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(keyMaterial(env)));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
function aad(userId:string,credentialId:string,keyVersion='v1'){return encoder.encode(`${userId}:${credentialId}:${keyVersion}`);}

export async function sealCredentialMaterial(env:Bindings,userId:string,credentialId:string,value:unknown){
  const keyVersion='v1',key=await encryptionKey(env),iv=crypto.getRandomValues(new Uint8Array(12));
  const plaintext=encoder.encode(JSON.stringify(value));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(userId,credentialId,keyVersion)},key,plaintext);
  return{ciphertextB64:toBase64Url(new Uint8Array(encrypted)),ivB64:toBase64Url(iv),keyVersion};
}

export async function storeCredentialMaterial(env:Bindings,userId:string,credentialId:string,value:unknown){
  const sealed=await sealCredentialMaterial(env,userId,credentialId,value);
  await env.DB.prepare(`INSERT INTO hector_credential_secret_blobs(credential_id,user_id,ciphertext_b64,iv_b64,key_version,updated_at)
    VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(credential_id) DO UPDATE SET user_id=excluded.user_id,ciphertext_b64=excluded.ciphertext_b64,iv_b64=excluded.iv_b64,key_version=excluded.key_version,updated_at=CURRENT_TIMESTAMP`)
    .bind(credentialId,userId,sealed.ciphertextB64,sealed.ivB64,sealed.keyVersion).run();
  return{stored:true,keyVersion:sealed.keyVersion};
}

export async function loadCredentialMaterial<T=unknown>(env:Bindings,userId:string,credentialId:string):Promise<T|null>{
  const row=await env.DB.prepare('SELECT ciphertext_b64,iv_b64,key_version FROM hector_credential_secret_blobs WHERE credential_id=? AND user_id=?').bind(credentialId,userId).first<{ciphertext_b64:string;iv_b64:string;key_version:string}>();
  if(!row)return null;
  const key=await encryptionKey(env),iv=fromBase64Url(row.iv_b64),cipher=fromBase64Url(row.ciphertext_b64);
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(userId,credentialId,row.key_version)},key,cipher);
  return JSON.parse(decoder.decode(plaintext)) as T;
}

export async function tryRefreshCredential(env:Bindings,userId:string,credentialId:string,force=false){
  const credential=await env.DB.prepare('SELECT * FROM hector_agent_credentials WHERE id=? AND user_id=?').bind(credentialId,userId).first<HectorAgentCredential>();
  if(!credential||credential.auth_type!=='oauth'||!credential.refreshable||!credential.secret_ref.startsWith('encrypted:'))return{refreshed:false,reason:'not_refreshable'};
  const state=credentialState(credential);if(!force&&state.usable)return{refreshed:false,reason:'still_ready'};
  const material=await loadCredentialMaterial<Record<string,unknown>>(env,userId,credentialId);if(!material)return{refreshed:false,reason:'missing_material'};
  const metadata=parseJson<Record<string,unknown>>(credential.metadata_json,{}),endpoint=typeof metadata.tokenEndpoint==='string'?publicHttps(metadata.tokenEndpoint):null;
  if(!endpoint)return{refreshed:false,reason:'invalid_token_endpoint'};
  const allowed=Array.isArray(metadata.allowedHosts)?metadata.allowedHosts.map(String):[];if(!allowed.includes(endpoint.hostname))return{refreshed:false,reason:'token_endpoint_not_allowed'};
  const refreshToken=typeof material.refresh_token==='string'?material.refresh_token:'',clientId=typeof material.client_id==='string'?material.client_id:typeof metadata.clientId==='string'?metadata.clientId:'';
  if(!refreshToken||!clientId)return{refreshed:false,reason:'missing_refresh_fields'};
  const form=new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken,client_id:clientId});
  if(typeof material.client_secret==='string'&&material.client_secret)form.set('client_secret',material.client_secret);
  const extra=metadata.refreshParams;if(extra&&typeof extra==='object'&&!Array.isArray(extra))for(const [key,value] of Object.entries(extra))if(typeof value==='string')form.set(key,value);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(endpoint.toString(),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:form.toString(),redirect:'manual',signal:controller.signal});
    const data=await response.json<Record<string,unknown>>().catch(()=>({}));
    if(!response.ok){await env.DB.prepare("UPDATE hector_agent_credentials SET status='refresh_required',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(credentialId,userId).run();return{refreshed:false,reason:`refresh_http_${response.status}`};}
    if(typeof data.access_token!=='string'||!data.access_token)return{refreshed:false,reason:'refresh_missing_access_token'};
    const merged={...material,...data,refresh_token:typeof data.refresh_token==='string'?data.refresh_token:refreshToken},expiresIn=Number(data.expires_in||0),expiresAt=Number.isFinite(expiresIn)&&expiresIn>0?new Date(Date.now()+Math.max(0,expiresIn-30)*1000).toISOString():null;
    await storeCredentialMaterial(env,userId,credentialId,merged);
    await env.DB.prepare("UPDATE hector_agent_credentials SET status='ready',expires_at=?,last_verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(expiresAt,credentialId,userId).run();
    return{refreshed:true,expiresAt};
  }catch(e){return{refreshed:false,reason:e instanceof Error?e.message:'refresh_failed'};}
  finally{clearTimeout(timer);}
}

export async function resolveCredential<T=unknown>(env:Bindings,userId:string,credentialId:string){
  let credential=await env.DB.prepare('SELECT * FROM hector_agent_credentials WHERE id=? AND user_id=?').bind(credentialId,userId).first<HectorAgentCredential>();
  if(!credential)return{usable:false as const,state:'missing' as const,credential:null,material:null};
  let state=credentialState(credential);
  if(!state.usable&&credential.refreshable&&(state.state==='refresh_required'||state.state==='expired')){
    const refreshed=await tryRefreshCredential(env,userId,credentialId);
    if(refreshed.refreshed){credential=await env.DB.prepare('SELECT * FROM hector_agent_credentials WHERE id=? AND user_id=?').bind(credentialId,userId).first<HectorAgentCredential>()||credential;state=credentialState(credential);}
  }
  if(!state.usable)return{usable:false as const,state:state.state,credential,material:null};
  const material=credential.secret_ref.startsWith('encrypted:')?await loadCredentialMaterial<T>(env,userId,credentialId):null;
  return{usable:true as const,state:state.state,credential,material};
}

export function credentialBrokerAvailable(env:Bindings){return Boolean((env.HECTOR_CREDENTIAL_KEY||env.REMOTE_CONTROL_TOKEN||'').trim());}
