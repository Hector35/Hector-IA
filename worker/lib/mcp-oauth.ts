export const MCP_OAUTH_CLIENT_PREFIX='htr_dcr_';
export const MCP_READ_SCOPES=['mcp','context','tools','jobs','bridge'] as const;
export const MCP_FULL_SCOPES=['mcp','context','tools','jobs','bridge'] as const;

export type McpResourceProfile={mode:'read-only'|'full';path:'/mcp-read'|'/mcp';resource:string;scopes:string[]};
export type DynamicClientMetadata={clientName:string;redirectUris:string[]};

const encoder=new TextEncoder();
const decoder=new TextDecoder();
const LOOPBACK_HOSTS=new Set(['127.0.0.1','localhost','[::1]','::1']);

function bytesToBase64Url(bytes:Uint8Array){
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function base64UrlToBytes(value:string){
 if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('client_id inválido');
 const normalized=value.replace(/-/g,'+').replace(/_/g,'/'),padded=normalized+'='.repeat((4-normalized.length%4)%4);
 const binary=atob(padded),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes;
}
function canonicalOrigin(input:string){const url=new URL(input);return`${url.protocol}//${url.host}`;}

export function isAllowedOpenAIRedirect(uri:string){
 try{
  if(uri.length>700)return false;
  const url=new URL(uri);
  if(url.username||url.password||url.hash)return false;
  const host=url.hostname.toLowerCase();
  if(url.protocol==='http:')return LOOPBACK_HOSTS.has(host);
  if(url.protocol!=='https:')return false;
  return host==='chatgpt.com'||host.endsWith('.chatgpt.com')||host==='openai.com'||host.endsWith('.openai.com');
 }catch{return false;}
}

export function redirectUriMatches(registered:string,requested:string){
 if(!isAllowedOpenAIRedirect(registered)||!isAllowedOpenAIRedirect(requested))return false;
 try{
  const a=new URL(registered),b=new URL(requested);
  if(a.protocol!==b.protocol||a.hostname.toLowerCase()!==b.hostname.toLowerCase()||a.pathname!==b.pathname||a.search!==b.search)return false;
  if(a.protocol==='http:'&&LOOPBACK_HOSTS.has(a.hostname.toLowerCase())&&!a.port)return true;
  return a.port===b.port;
 }catch{return false;}
}

export function normalizeDynamicClientRegistration(input:any):DynamicClientMetadata{
 const redirects:string[]=Array.isArray(input?.redirect_uris)?input.redirect_uris.map((x:unknown)=>String(x||'').trim()).filter((x:string)=>Boolean(x)):[];
 if(redirects.length<1||redirects.length>8||redirects.some(uri=>!isAllowedOpenAIRedirect(uri)))throw new Error('redirect_uris no permitidos');
 const grantTypes:string[]=Array.isArray(input?.grant_types)?input.grant_types.map((x:unknown)=>String(x)):['authorization_code'];
 const responseTypes:string[]=Array.isArray(input?.response_types)?input.response_types.map((x:unknown)=>String(x)):['code'];
 if(!grantTypes.includes('authorization_code')||!responseTypes.includes('code'))throw new Error('Solo authorization_code es compatible');
 if(input?.token_endpoint_auth_method&&input.token_endpoint_auth_method!=='none')throw new Error('Solo clientes públicos PKCE son compatibles');
 const clientName=String(input?.client_name||input?.software_id||'OpenAI MCP client').trim().slice(0,120)||'OpenAI MCP client';
 return{clientName,redirectUris:Array.from(new Set<string>(redirects))};
}

export function encodeDynamicClientId(metadata:DynamicClientMetadata){
 const payload=JSON.stringify({v:1,n:metadata.clientName,r:metadata.redirectUris});
 if(payload.length>6000)throw new Error('Registro de cliente demasiado grande');
 return MCP_OAUTH_CLIENT_PREFIX+bytesToBase64Url(encoder.encode(payload));
}

export function decodeDynamicClientId(clientId:string):DynamicClientMetadata{
 if(!clientId.startsWith(MCP_OAUTH_CLIENT_PREFIX)||clientId.length>9000)throw new Error('client_id desconocido');
 const raw=decoder.decode(base64UrlToBytes(clientId.slice(MCP_OAUTH_CLIENT_PREFIX.length)));
 const parsed=JSON.parse(raw);
 if(parsed?.v!==1||typeof parsed?.n!=='string'||!Array.isArray(parsed?.r))throw new Error('client_id inválido');
 return normalizeDynamicClientRegistration({client_name:parsed.n,redirect_uris:parsed.r,grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none'});
}

export function resourceProfile(originOrUrl:string,resource:string):McpResourceProfile|null{
 const origin=canonicalOrigin(originOrUrl),read=`${origin}/mcp-read`,full=`${origin}/mcp`;
 if(resource===read)return{mode:'read-only',path:'/mcp-read',resource:read,scopes:[...MCP_READ_SCOPES]};
 if(resource===full)return{mode:'full',path:'/mcp',resource:full,scopes:[...MCP_FULL_SCOPES]};
 return null;
}

export function normalizeScopes(scopeValue:string|undefined,supported:string[]){
 const requested=(scopeValue||'').split(/\s+/).map(x=>x.trim()).filter(Boolean);
 const scopes=requested.length?requested:[...supported];
 if(scopes.some(scope=>!supported.includes(scope)))throw new Error('scope no permitido');
 return[...new Set(scopes)];
}

export async function pkceS256(verifier:string){
 if(verifier.length<43||verifier.length>128||!/^[A-Za-z0-9._~-]+$/.test(verifier))throw new Error('code_verifier inválido');
 const digest=await crypto.subtle.digest('SHA-256',encoder.encode(verifier));
 return bytesToBase64Url(new Uint8Array(digest));
}

export function authorizationServerMetadata(originOrUrl:string){
 const origin=canonicalOrigin(originOrUrl);
 return{
  issuer:origin,
  authorization_response_iss_parameter_supported:true,
  authorization_endpoint:`${origin}/oauth/authorize`,
  token_endpoint:`${origin}/oauth/token`,
  registration_endpoint:`${origin}/oauth/register`,
  token_endpoint_auth_methods_supported:['none'],
  grant_types_supported:['authorization_code'],
  response_types_supported:['code'],
  code_challenge_methods_supported:['S256'],
  scopes_supported:[...MCP_FULL_SCOPES]
 };
}

export function protectedResourceMetadata(originOrUrl:string,path:'/mcp-read'|'/mcp'){
 const origin=canonicalOrigin(originOrUrl),profile=resourceProfile(origin,`${origin}${path}`)!;
 return{
  resource:profile.resource,
  authorization_servers:[origin],
  scopes_supported:profile.scopes,
  bearer_methods_supported:['header'],
  resource_documentation:`${origin}/oauth/help`
 };
}
