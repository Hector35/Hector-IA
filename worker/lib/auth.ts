import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Bindings, Variables } from '../types';
import { sha256 } from './crypto';
import { MCP_FULL_SCOPES, MCP_READ_SCOPES } from './mcp-oauth';

type AuthContext=Context<{Bindings:Bindings;Variables:Variables}>;

function parseScopes(value:string|undefined|null){
  if(!value)return[];
  try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.map(String):[];}catch{return[];}
}
function resourcePathAllows(resourcePath:string|null|undefined,requestUrl:string){
  if(!resourcePath)return true;
  const url=new URL(requestUrl);
  if(url.protocol==='https:'&&url.hostname==='hector.internal'&&(resourcePath==='/mcp'||resourcePath==='/mcp-read'))return true;
  const pathname=url.pathname;
  return pathname===resourcePath||pathname.startsWith(`${resourcePath}/`);
}
function mcpUnauthorized(c:AuthContext){
  const url=new URL(c.req.url),origin=`${url.protocol}//${url.host}`;
  let metadata='',scopes:string[]=[];
  if(url.pathname==='/mcp-read'||url.pathname.startsWith('/mcp-read/')){metadata=`${origin}/.well-known/oauth-protected-resource/mcp-read`;scopes=[...MCP_READ_SCOPES];}
  else if(url.pathname==='/mcp'||url.pathname.startsWith('/mcp/')){metadata=`${origin}/.well-known/oauth-protected-resource/mcp`;scopes=[...MCP_FULL_SCOPES];}
  if(metadata)c.header('WWW-Authenticate',`Bearer error="invalid_token", error_description="Authentication required", resource_metadata="${metadata}", scope="${scopes.join(' ')}"`);
  return c.json({error:'invalid_token',error_description:'Authentication required'},401);
}

export function authHasScope(c:AuthContext,scope:string){
  if(c.get('authMethod')==='session')return true;
  const scopes=c.get('authScopes')||[];
  return scopes.includes('*')||scopes.includes(scope);
}

export async function requireAuth(c:AuthContext,next:Next){
  const raw=getCookie(c,'hector_session');
  if(raw){
    const tokenHash=await sha256(raw);
    const row=await c.env.DB.prepare(`SELECT users.id,users.name FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at > datetime('now')`).bind(tokenHash).first<{id:string;name:string}>();
    if(row){
      c.set('userId',row.id);c.set('userName',row.name);c.set('authMethod','session');c.set('authScopes',['*']);
      await next();return;
    }
  }

  const authorization=c.req.header('Authorization')||'';
  const match=authorization.match(/^Bearer\s+(.+)$/i);
  if(match){
    const token=match[1].trim();
    if(token.length>=24&&token.length<=512){
      const tokenHash=await sha256(token);
      const row=await c.env.DB.prepare(`SELECT t.id token_id,t.scopes_json,t.resource_path,u.id,u.name
        FROM external_access_tokens t JOIN users u ON u.id=t.user_id
        WHERE t.token_hash=? AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>CURRENT_TIMESTAMP) LIMIT 1`).bind(tokenHash).first<{token_id:string;scopes_json:string;resource_path:string|null;id:string;name:string}>();
      if(row&&resourcePathAllows(row.resource_path,c.req.url)){
        c.set('userId',row.id);c.set('userName',row.name);c.set('authMethod','external_token');c.set('authTokenId',row.token_id);c.set('authScopes',parseScopes(row.scopes_json));
        await c.env.DB.prepare('UPDATE external_access_tokens SET last_used_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(row.token_id).run();
        await next();return;
      }
    }
  }

  return mcpUnauthorized(c);
}
