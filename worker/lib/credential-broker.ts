import type {Bindings} from '../types';
import {credentialState,type HectorAgentCredential} from './hector-agent-resilience';

const encoder=new TextEncoder(),decoder=new TextDecoder();

function keyMaterial(env:Bindings){
  const value=(env.HECTOR_CREDENTIAL_KEY||env.REMOTE_CONTROL_TOKEN||'').trim();
  if(!value)throw new Error('credential_broker_key_unconfigured');
  return value;
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

export async function resolveCredential<T=unknown>(env:Bindings,userId:string,credentialId:string){
  const credential=await env.DB.prepare('SELECT * FROM hector_agent_credentials WHERE id=? AND user_id=?').bind(credentialId,userId).first<HectorAgentCredential>();
  if(!credential)return{usable:false as const,state:'missing' as const,credential:null,material:null};
  const state=credentialState(credential);
  if(!state.usable)return{usable:false as const,state:state.state,credential,material:null};
  const material=credential.secret_ref.startsWith('encrypted:')?await loadCredentialMaterial<T>(env,userId,credentialId):null;
  return{usable:true as const,state:state.state,credential,material};
}

export function credentialBrokerAvailable(env:Bindings){return Boolean((env.HECTOR_CREDENTIAL_KEY||env.REMOTE_CONTROL_TOKEN||'').trim());}
