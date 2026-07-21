export type GitHubActionsClaims={iss?:string;aud?:string|string[];exp?:number;nbf?:number;repository?:string;ref?:string;workflow_ref?:string;event_name?:string;actor?:string;sub?:string};
export type GitHubActionsPolicy={
  audience:string;
  workflows:string[];
  events:string[];
  refs?:string[];
  refPrefixes?:string[];
};

const repository='Hector35/Hector-IA';
const decoder=new TextDecoder();
function decodePart(value:string){
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');
  return Uint8Array.from(atob(normalized),c=>c.charCodeAt(0));
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
function audienceMatches(aud:GitHubActionsClaims['aud'],expected:string){return Array.isArray(aud)?aud.includes(expected):aud===expected;}

export function authorizeGitHubActionsClaims(claims:GitHubActionsClaims,policy:GitHubActionsPolicy){
  if(claims.repository!==repository)throw new Error('Repositorio OIDC no autorizado');
  if(!claims.event_name||!policy.events.includes(claims.event_name))throw new Error('Evento OIDC no autorizado');
  const workflow=claims.workflow_ref?.split('@',1)[0];
  const allowed=policy.workflows.map(file=>`${repository}/.github/workflows/${file}`);
  if(!workflow||!allowed.includes(workflow))throw new Error('Workflow OIDC no autorizado');
  const exactAllowed=!policy.refs?.length||!!claims.ref&&policy.refs.includes(claims.ref);
  const prefixAllowed=!policy.refPrefixes?.length||!!claims.ref&&policy.refPrefixes.some(prefix=>claims.ref!.startsWith(prefix));
  if(policy.refs?.length&&policy.refPrefixes?.length){
    if(!exactAllowed&&!prefixAllowed)throw new Error('Referencia OIDC no autorizada');
  }else if(!exactAllowed||!prefixAllowed)throw new Error('Referencia OIDC no autorizada');
  return claims;
}

export async function verifyGitHubActionsToken(token:string,policy:GitHubActionsPolicy):Promise<GitHubActionsClaims>{
  const parts=token.split('.');
  if(parts.length!==3)throw new Error('JWT inválido');
  const header=jsonPart<{alg?:string;kid?:string}>(parts[0]);
  const claims=jsonPart<GitHubActionsClaims>(parts[1]);
  if(header.alg!=='RS256'||!header.kid)throw new Error('Algoritmo OIDC inválido');
  const keys=await githubKeys(),jwk=keys.find(key=>key.kid===header.kid);
  if(!jwk)throw new Error('Clave OIDC desconocida');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodePart(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if(!valid)throw new Error('Firma OIDC inválida');
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!=='https://token.actions.githubusercontent.com')throw new Error('Emisor OIDC inválido');
  if(!audienceMatches(claims.aud,policy.audience))throw new Error('Audiencia OIDC inválida');
  if(!claims.exp||claims.exp<now-30)throw new Error('Token OIDC expirado');
  if(claims.nbf&&claims.nbf>now+30)throw new Error('Token OIDC aún no válido');
  return authorizeGitHubActionsClaims(claims,policy);
}
