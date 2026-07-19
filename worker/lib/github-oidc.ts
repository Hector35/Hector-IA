type Claims={iss?:string;aud?:string|string[];exp?:number;nbf?:number;repository?:string;ref?:string;workflow_ref?:string;event_name?:string;actor?:string;sub?:string};

const decoder=new TextDecoder();
function decodePart(value:string){
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');
  const bytes=Uint8Array.from(atob(normalized),c=>c.charCodeAt(0));
  return bytes;
}
function jsonPart<T>(value:string):T{return JSON.parse(decoder.decode(decodePart(value))) as T;}

let jwksCache:{expires:number;keys:any[]}|undefined;
async function githubKeys(){
  if(jwksCache&&jwksCache.expires>Date.now())return jwksCache.keys;
  const res=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks');
  if(!res.ok)throw new Error('No se pudo obtener JWKS de GitHub');
  const data=await res.json<{keys:any[]}>();
  jwksCache={keys:data.keys,expires:Date.now()+60*60*1000};
  return data.keys;
}
function audienceMatches(aud:Claims['aud'],expected:string){return Array.isArray(aud)?aud.includes(expected):aud===expected;}

export async function verifyGitHubActionsToken(token:string,expectedAudience:string):Promise<Claims>{
  const parts=token.split('.');
  if(parts.length!==3)throw new Error('JWT inválido');
  const header=jsonPart<{alg?:string;kid?:string}>(parts[0]);
  const claims=jsonPart<Claims>(parts[1]);
  if(header.alg!=='RS256'||!header.kid)throw new Error('Algoritmo OIDC inválido');
  const keys=await githubKeys(),jwk=keys.find(key=>key.kid===header.kid);
  if(!jwk)throw new Error('Clave OIDC desconocida');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodePart(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if(!valid)throw new Error('Firma OIDC inválida');
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!=='https://token.actions.githubusercontent.com')throw new Error('Emisor OIDC inválido');
  if(!audienceMatches(claims.aud,expectedAudience))throw new Error('Audiencia OIDC inválida');
  if(!claims.exp||claims.exp<now-30)throw new Error('Token OIDC expirado');
  if(claims.nbf&&claims.nbf>now+30)throw new Error('Token OIDC aún no válido');
  if(claims.repository!=='Hector35/Hector-IA')throw new Error('Repositorio OIDC no autorizado');
  if(claims.ref!=='refs/heads/main')throw new Error('Solo main puede solicitar automejoras');
  if(!claims.workflow_ref?.includes('Hector35/Hector-IA/.github/workflows/self-improve.yml@refs/heads/main'))throw new Error('Workflow OIDC no autorizado');
  if(!['push','workflow_dispatch'].includes(claims.event_name||''))throw new Error('Evento OIDC no autorizado');
  return claims;
}
