import {Hono} from 'hono';
import {getCookie} from 'hono/cookie';
import type {Bindings,Variables} from '../types';
import {randomToken,sha256} from '../lib/crypto';
import {
 authorizationServerMetadata,decodeDynamicClientId,encodeDynamicClientId,normalizeDynamicClientRegistration,
 normalizeScopes,pkceS256,protectedResourceMetadata,redirectUriMatches,resourceProfile
} from '../lib/mcp-oauth';

export const mcpOAuth=new Hono<{Bindings:Bindings;Variables:Variables}>();

const CODE_TTL_SECONDS=5*60;
const TOKEN_TTL_SECONDS=30*24*60*60;
const REFRESH_TTL_SECONDS=90*24*60*60;

function originOf(url:string){const u=new URL(url);return`${u.protocol}//${u.host}`;}
function esc(value:unknown){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]||ch));}
function oauthHeaders(c:any){c.header('Cache-Control','no-store');c.header('Pragma','no-cache');}
function htmlPage(title:string,body:string){return`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(title)}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:0 auto;padding:32px 20px;line-height:1.45}main{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:18px;padding:24px}h1{font-size:1.45rem;margin-top:0}.muted{opacity:.72}.warn{padding:12px 14px;border:1px solid #b36b00;border-radius:12px}button,a.button{display:inline-block;font:inherit;padding:11px 16px;border-radius:11px;border:1px solid currentColor;background:transparent;color:inherit;text-decoration:none;cursor:pointer;margin:4px 8px 4px 0}.primary{font-weight:700}code{overflow-wrap:anywhere}</style></head><body><main>${body}</main></body></html>`;}
function hidden(name:string,value:unknown){return`<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;}
function safeOrigin(value:string|undefined){try{return value?originOf(value):'';}catch{return'';}}
function validConsentSource(c:any){
 const expectedOrigin=originOf(c.req.url),requestOrigin=c.req.header('Origin'),referer=c.req.header('Referer'),fetchSite=(c.req.header('Sec-Fetch-Site')||'').toLowerCase();
 if(requestOrigin&&requestOrigin!=='null'&&safeOrigin(requestOrigin)===expectedOrigin)return true;
 if(referer&&safeOrigin(referer)===expectedOrigin)return true;
 return fetchSite==='same-origin';
}
function parseStoredScopes(value:string){
 try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.map(String):[];}catch{return[];}
}
function parseRefreshMarker(value:string|null|undefined){
 const match=String(value||'').match(/^refresh:(\/mcp(?:-read)?):([a-f0-9]{64})$/);
 return match?{path:match[1] as '/mcp'|'/mcp-read',clientHash:match[2]}:null;
}
async function refreshMarker(path:'/mcp'|'/mcp-read',clientId:string){return`refresh:${path}:${await sha256(clientId)}`;}
async function currentSession(c:any){
 const raw=getCookie(c,'hector_session');if(!raw)return null;
 const tokenHash=await sha256(raw);
 return await c.env.DB.prepare(`SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') LIMIT 1`).bind(tokenHash).first() as {id:string;name:string}|null;
}
function trustedAuthorizationRequest(urlString:string){
 const url=new URL(urlString),origin=originOf(urlString);
 const clientId=url.searchParams.get('client_id')||'',redirectUri=url.searchParams.get('redirect_uri')||'',responseType=url.searchParams.get('response_type')||'',resource=url.searchParams.get('resource')||'',scope=url.searchParams.get('scope')||'',challenge=url.searchParams.get('code_challenge')||'',challengeMethod=url.searchParams.get('code_challenge_method')||'',state=url.searchParams.get('state')||'';
 if(responseType!=='code')throw new Error('response_type debe ser code');
 const client=decodeDynamicClientId(clientId);
 if(!client.redirectUris.some(uri=>redirectUriMatches(uri,redirectUri)))throw new Error('redirect_uri no registrado');
 const profile=resourceProfile(origin,resource);if(!profile)throw new Error('resource debe ser /mcp-read o /mcp en este servidor');
 if(challengeMethod!=='S256'||challenge.length<43||challenge.length>128||!/^[A-Za-z0-9_-]+$/.test(challenge))throw new Error('PKCE S256 requerido');
 const scopes=normalizeScopes(scope,profile.scopes);
 return{origin,clientId,client,redirectUri,resource,profile,scopes,scope:scopes.join(' '),challenge,state};
}
function redirectWithOAuthResult(request:{origin:string;redirectUri:string;state:string},params:Record<string,string>){
 const target=new URL(request.redirectUri);for(const [key,value] of Object.entries(params))target.searchParams.set(key,value);
 if(request.state)target.searchParams.set('state',request.state);target.searchParams.set('iss',request.origin);return target.toString();
}
async function issueTokens(c:any,input:{userId:string;clientId:string;clientName:string;path:'/mcp'|'/mcp-read';resource:string;scopes:string[]}){
 const rawAccess=`htr_${randomToken(32)}`,accessHash=await sha256(rawAccess),accessId=crypto.randomUUID(),accessExpiresAt=new Date(Date.now()+TOKEN_TTL_SECONDS*1000).toISOString();
 const statements=[c.env.DB.prepare('INSERT INTO external_access_tokens(id,user_id,name,token_hash,scopes_json,expires_at,resource_path) VALUES(?,?,?,?,?,?,?)').bind(accessId,input.userId,`OAuth ${input.clientName}`.slice(0,120),accessHash,JSON.stringify(input.scopes),accessExpiresAt,input.path)];
 let rawRefresh:string|undefined;
 if(input.scopes.includes('offline_access')){
  rawRefresh=`hrr_${randomToken(48)}`;
  const refreshHash=await sha256(rawRefresh),refreshExpiresAt=new Date(Date.now()+REFRESH_TTL_SECONDS*1000).toISOString(),marker=await refreshMarker(input.path,input.clientId);
  statements.push(c.env.DB.prepare('INSERT INTO external_access_tokens(id,user_id,name,token_hash,scopes_json,expires_at,resource_path) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),input.userId,`OAuth ${input.clientName} refresh`.slice(0,120),refreshHash,JSON.stringify(input.scopes),refreshExpiresAt,marker));
 }
 await c.env.DB.batch(statements);
 return{access_token:rawAccess,token_type:'Bearer',expires_in:TOKEN_TTL_SECONDS,scope:input.scopes.join(' '),resource:input.resource,...(rawRefresh?{refresh_token:rawRefresh}:{})};
}

mcpOAuth.get('/.well-known/oauth-authorization-server',c=>{oauthHeaders(c);return c.json(authorizationServerMetadata(c.req.url));});
mcpOAuth.get('/.well-known/oauth-protected-resource',c=>{oauthHeaders(c);return c.json(protectedResourceMetadata(c.req.url,'/mcp-read'));});
mcpOAuth.get('/.well-known/oauth-protected-resource/mcp-read',c=>{oauthHeaders(c);return c.json(protectedResourceMetadata(c.req.url,'/mcp-read'));});
mcpOAuth.get('/.well-known/oauth-protected-resource/mcp',c=>{oauthHeaders(c);return c.json(protectedResourceMetadata(c.req.url,'/mcp'));});

mcpOAuth.get('/oauth/help',c=>{oauthHeaders(c);return c.html(htmlPage('Acceso MCP de Héctor',`<h1>Acceso MCP de Héctor</h1><p>Este servidor usa OAuth 2.1 con PKCE para autorizar clientes OpenAI y Codex.</p><p><strong>/mcp-read</strong> concede solo herramientas de consulta. <strong>/mcp</strong> puede incluir acciones que modifican Héctor y siempre muestra una advertencia antes de conceder acceso.</p><p class="muted">Los tokens se vinculan al recurso autorizado, los refresh tokens se rotan en cada uso y todos pueden revocarse desde Héctor OS.</p>`));});

mcpOAuth.post('/oauth/register',async c=>{
 oauthHeaders(c);
 try{
  const body=await c.req.json().catch(()=>null),client=normalizeDynamicClientRegistration(body),clientId=encodeDynamicClientId(client);
  return c.json({client_id:clientId,client_name:client.clientName,redirect_uris:client.redirectUris,grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',client_id_issued_at:Math.floor(Date.now()/1000)},201);
 }catch(error){return c.json({error:'invalid_client_metadata',error_description:error instanceof Error?error.message:'Registro inválido'},400);}
});

mcpOAuth.get('/oauth/authorize',async c=>{
 oauthHeaders(c);
 let request:ReturnType<typeof trustedAuthorizationRequest>;
 try{request=trustedAuthorizationRequest(c.req.url);}catch(error){return c.html(htmlPage('Solicitud OAuth inválida',`<h1>No se puede autorizar</h1><p>${esc(error instanceof Error?error.message:'Solicitud OAuth inválida')}</p>`),400);}
 const session=await currentSession(c);
 if(!session){
  const here=new URL(c.req.url);here.searchParams.set('continue','1');
  return c.html(htmlPage('Inicia sesión en Héctor',`<h1>Autorizar ${esc(request.client.clientName)}</h1><p>El navegador aún no entregó una sesión de Héctor a esta solicitud.</p><p>Si ya tienes sesión abierta, toca <strong>Continuar autorización</strong>. Si no, abre Héctor OS, inicia sesión y vuelve a esta pestaña.</p><p><a class="button primary" href="${esc(here.toString())}">Continuar autorización</a><a class="button" target="_blank" rel="noopener" href="/">Abrir Héctor OS</a></p><p class="muted">La cookie de sesión permanece SameSite=Strict; no se debilita para OAuth.</p>`));
 }
 const full=request.profile.mode==='full';
 const warning=full?`<p class="warn"><strong>Acceso completo:</strong> este cliente podrá usar herramientas de Héctor que creen o modifiquen datos dentro de los scopes mostrados.</p>`:`<p><strong>Solo lectura:</strong> el recurso autorizado es <code>/mcp-read</code>; no expone herramientas de escritura.</p>`;
 const fields=[['client_id',request.clientId],['redirect_uri',request.redirectUri],['response_type','code'],['resource',request.resource],['scope',request.scope],['code_challenge',request.challenge],['code_challenge_method','S256'],['state',request.state]].map(([k,v])=>hidden(k,v)).join('');
 return c.html(htmlPage('Autorizar acceso a Héctor',`<h1>Autorizar ${esc(request.client.clientName)}</h1><p>Sesión: <strong>${esc(session.name)}</strong></p>${warning}<p>Recurso: <code>${esc(request.resource)}</code></p><p>Permisos: <code>${esc(request.scope)}</code></p><p>Al continuar, Héctor entregará un código de un solo uso protegido por PKCE.</p><form method="post" action="/oauth/authorize">${fields}<button class="primary" name="decision" value="allow" type="submit">Autorizar</button><button name="decision" value="deny" type="submit">Cancelar</button></form><p class="muted">Destino: ${esc(new URL(request.redirectUri).host)}</p>`));
});

mcpOAuth.post('/oauth/authorize',async c=>{
 oauthHeaders(c);
 if(!validConsentSource(c))return c.json({error:'invalid_request',error_description:'Origen de consentimiento inválido'},403);
 const session=await currentSession(c);if(!session)return c.json({error:'login_required'},401);
 const form=await c.req.parseBody(),query=new URL(c.req.url);
 for(const key of ['client_id','redirect_uri','response_type','resource','scope','code_challenge','code_challenge_method','state'])query.searchParams.set(key,String(form[key]||''));
 let request:ReturnType<typeof trustedAuthorizationRequest>;
 try{request=trustedAuthorizationRequest(query.toString());}catch(error){return c.json({error:'invalid_request',error_description:error instanceof Error?error.message:'Solicitud inválida'},400);}
 if(String(form.decision||'')!=='allow')return c.redirect(redirectWithOAuthResult(request,{error:'access_denied'}),302);
 const rawCode=`hoc_${randomToken(32)}`,codeHash=await sha256(rawCode),id=crypto.randomUUID(),expiresAt=new Date(Date.now()+CODE_TTL_SECONDS*1000).toISOString();
 await c.env.DB.batch([
  c.env.DB.prepare("DELETE FROM mcp_oauth_codes WHERE expires_at<=CURRENT_TIMESTAMP OR consumed_at IS NOT NULL"),
  c.env.DB.prepare('INSERT INTO mcp_oauth_codes(id,code_hash,user_id,client_id,redirect_uri,resource,scope,code_challenge,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,codeHash,session.id,request.clientId,request.redirectUri,request.resource,request.scope,request.challenge,expiresAt)
 ]);
 return c.redirect(redirectWithOAuthResult(request,{code:rawCode}),302);
});

mcpOAuth.post('/oauth/token',async c=>{
 oauthHeaders(c);
 const type=(c.req.header('Content-Type')||'').toLowerCase();if(!type.includes('application/x-www-form-urlencoded'))return c.json({error:'invalid_request',error_description:'Content-Type debe ser application/x-www-form-urlencoded'},400);
 const form=await c.req.parseBody(),grantType=String(form.grant_type||''),clientId=String(form.client_id||''),resource=String(form.resource||''),requestedScope=String(form.scope||'').trim();
 try{
  if(grantType==='authorization_code'){
   const rawCode=String(form.code||''),redirectUri=String(form.redirect_uri||''),verifier=String(form.code_verifier||'');
   if(!rawCode||!clientId||!redirectUri||!resource||!verifier)return c.json({error:'invalid_request'},400);
   const client=decodeDynamicClientId(clientId);if(!client.redirectUris.some(uri=>redirectUriMatches(uri,redirectUri)))throw new Error('redirect_uri no registrado');
   const profile=resourceProfile(c.req.url,resource);if(!profile)throw new Error('resource inválido');
   const codeHash=await sha256(rawCode),row=await c.env.DB.prepare(`SELECT id,user_id,client_id,redirect_uri,resource,scope,code_challenge FROM mcp_oauth_codes WHERE code_hash=? AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(codeHash).first<{id:string;user_id:string;client_id:string;redirect_uri:string;resource:string;scope:string;code_challenge:string}>();
   if(!row)throw new Error('Código inválido o vencido');
   if(row.client_id!==clientId||row.redirect_uri!==redirectUri||row.resource!==resource)throw new Error('Código no corresponde al cliente o recurso');
   const actualChallenge=await pkceS256(verifier);if(actualChallenge!==row.code_challenge)throw new Error('PKCE inválido');
   const scopes=normalizeScopes(row.scope,profile.scopes),consume=await c.env.DB.prepare('UPDATE mcp_oauth_codes SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL').bind(row.id).run();
   if(Number(consume.meta.changes||0)!==1)throw new Error('Código ya utilizado');
   return c.json(await issueTokens(c,{userId:row.user_id,clientId,clientName:client.clientName,path:profile.path,resource,scopes}));
  }

  if(grantType==='refresh_token'){
   const rawRefresh=String(form.refresh_token||'');if(!rawRefresh||!clientId)return c.json({error:'invalid_request'},400);
   const client=decodeDynamicClientId(clientId),refreshHash=await sha256(rawRefresh);
   const row=await c.env.DB.prepare(`SELECT id,user_id,scopes_json,resource_path FROM external_access_tokens WHERE token_hash=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP) LIMIT 1`).bind(refreshHash).first<{id:string;user_id:string;scopes_json:string;resource_path:string|null}>();
   const marker=parseRefreshMarker(row?.resource_path);if(!row||!marker)throw new Error('Refresh token inválido o vencido');
   if(marker.clientHash!==await sha256(clientId))throw new Error('Refresh token no corresponde al cliente');
   const canonicalResource=`${originOf(c.req.url)}${marker.path}`;if(resource&&resource!==canonicalResource)throw new Error('resource no corresponde al refresh token');
   const profile=resourceProfile(c.req.url,canonicalResource);if(!profile)throw new Error('Recurso del refresh token inválido');
   const originalScopes=normalizeScopes(parseStoredScopes(row.scopes_json).join(' '),profile.scopes);if(!originalScopes.includes('offline_access'))throw new Error('Refresh token sin offline_access');
   const scopes=requestedScope?normalizeScopes(requestedScope,profile.scopes):originalScopes;
   if(scopes.some(scope=>!originalScopes.includes(scope)))throw new Error('scope excede el consentimiento original');
   const rotated=await c.env.DB.prepare('UPDATE external_access_tokens SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL').bind(row.id).run();
   if(Number(rotated.meta.changes||0)!==1)throw new Error('Refresh token ya utilizado');
   return c.json(await issueTokens(c,{userId:row.user_id,clientId,clientName:client.clientName,path:profile.path,resource:canonicalResource,scopes}));
  }

  return c.json({error:'unsupported_grant_type'},400);
 }catch(error){return c.json({error:'invalid_grant',error_description:error instanceof Error?error.message:'No se pudo procesar el grant'},400);}
});
