import {describe,expect,it} from 'vitest';
import {
 authorizationServerMetadata,decodeDynamicClientId,encodeDynamicClientId,isAllowedOpenAIRedirect,
 normalizeDynamicClientRegistration,pkceS256,protectedResourceMetadata,redirectUriMatches,resourceProfile
} from './mcp-oauth';

describe('MCP OAuth redirect policy',()=>{
 it('permite callbacks OpenAI y loopback de Codex pero no terceros',()=>{
  expect(isAllowedOpenAIRedirect('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
  expect(isAllowedOpenAIRedirect('https://api.openai.com/oauth/callback')).toBe(true);
  expect(isAllowedOpenAIRedirect('http://127.0.0.1:43123/callback')).toBe(true);
  expect(isAllowedOpenAIRedirect('http://localhost:43123/callback')).toBe(true);
  expect(isAllowedOpenAIRedirect('https://evil.example/callback')).toBe(false);
  expect(isAllowedOpenAIRedirect('https://chatgpt.com@evil.example/callback')).toBe(false);
  expect(isAllowedOpenAIRedirect('https://chatgpt.com/callback#fragment')).toBe(false);
 });
 it('permite puerto dinámico solo en loopback registrado sin puerto',()=>{
  expect(redirectUriMatches('http://127.0.0.1/callback','http://127.0.0.1:58431/callback')).toBe(true);
  expect(redirectUriMatches('http://127.0.0.1:9000/callback','http://127.0.0.1:58431/callback')).toBe(false);
  expect(redirectUriMatches('https://chatgpt.com/connector_platform_oauth_redirect','https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
 });
});

describe('MCP OAuth dynamic registration',()=>{
 it('codifica y valida un cliente público DCR sin persistir secretos',()=>{
  const metadata=normalizeDynamicClientRegistration({client_name:'Codex',redirect_uris:['http://127.0.0.1/callback'],grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none'});
  expect(decodeDynamicClientId(encodeDynamicClientId(metadata))).toEqual(metadata);
  expect(()=>normalizeDynamicClientRegistration({redirect_uris:['https://evil.example/cb']})).toThrow();
  expect(()=>normalizeDynamicClientRegistration({redirect_uris:['https://chatgpt.com/cb'],token_endpoint_auth_method:'client_secret_basic'})).toThrow();
 });
});

describe('MCP OAuth resources and discovery',()=>{
 it('separa lectura de acceso completo',()=>{
  const read=resourceProfile('https://hector.example','https://hector.example/mcp-read');
  const full=resourceProfile('https://hector.example','https://hector.example/mcp');
  expect(read).toMatchObject({mode:'read-only',path:'/mcp-read'});
  expect(read?.scopes).not.toContain('mcp');
  expect(full).toMatchObject({mode:'full',path:'/mcp'});
  expect(full?.scopes).toContain('mcp');
 });
 it('publica DCR, PKCE S256 e issuer identification',()=>{
  const auth=authorizationServerMetadata('https://hector.example/mcp-read');
  expect(auth).toMatchObject({issuer:'https://hector.example',authorization_response_iss_parameter_supported:true,registration_endpoint:'https://hector.example/oauth/register'});
  expect(auth.code_challenge_methods_supported).toEqual(['S256']);
  const resource=protectedResourceMetadata('https://hector.example','/mcp-read');
  expect(resource.resource).toBe('https://hector.example/mcp-read');
  expect(resource.authorization_servers).toEqual(['https://hector.example']);
 });
});

describe('MCP OAuth PKCE',()=>{
 it('coincide con el vector RFC 7636',async()=>{
  expect(await pkceS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
 });
});
