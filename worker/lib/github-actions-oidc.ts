const ISSUER='https://token.actions.githubusercontent.com';
const AUDIENCE='hector-asi-model-inference';
const REPOSITORY='Hector35/Hector-IA';
const WORKFLOW_REF='Hector35/Hector-IA/.github/workflows/hector-custom-model-chat.yml@refs/heads/main';

type Claims={
 iss?:string;
 aud?:string|string[];
 exp?:number;
 nbf?:number;
 repository?:string;
 ref?:string;
 workflow_ref?:string;
 event_name?:string;
 [key:string]:unknown;
};

type Jwk={kid?:string;kty?:string;n?:string;e?:string;alg?:string;use?:string};
let cachedKeys:{expires:number;keys:Jwk[]}|undefined;

function decodeBase64Url(value:string){
 const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((value.length+3)%4);
 const binary=atob(padded),bytes=new Uint8Array(binary.length);
 for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
 return bytes;
}

function decodeJson<T>(value:string):T{return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;}
function includesAudience(aud:Claims['aud']){return Array.isArray(aud)?aud.includes(AUDIENCE):aud===AUDIENCE;}

export function assertGitHubActionsClaims(claims:Claims,nowSeconds=Math.floor(Date.now()/1000)){
 if(claims.iss!==ISSUER)throw new Error('OIDC issuer inválido');
 if(!includesAudience(claims.aud))throw new Error('OIDC audience inválida');
 if(!claims.exp||claims.exp<nowSeconds-30)throw new Error('OIDC expirado');
 if(claims.nbf&&claims.nbf>nowSeconds+30)throw new Error('OIDC aún no válido');
 if(claims.repository!==REPOSITORY)throw new Error('Repositorio OIDC no autorizado');
 if(claims.ref!=='refs/heads/main')throw new Error('Ref OIDC no autorizada');
 if(claims.workflow_ref!==WORKFLOW_REF)throw new Error('Workflow OIDC no autorizado');
 if(claims.event_name!=='workflow_dispatch')throw new Error('Evento OIDC no autorizado');
 return claims;
}

async function keys(){
 if(cachedKeys&&cachedKeys.expires>Date.now())return cachedKeys.keys;
 const response=await fetch(`${ISSUER}/.well-known/jwks`);
 if(!response.ok)throw new Error(`No se pudo leer JWKS de GitHub: ${response.status}`);
 const payload=await response.json() as {keys?:Jwk[]};
 if(!Array.isArray(payload.keys)||!payload.keys.length)throw new Error('JWKS de GitHub vacío');
 cachedKeys={expires:Date.now()+60*60*1000,keys:payload.keys};
 return payload.keys;
}

export async function verifyGitHubActionsOidc(authorization:string|undefined){
 const token=(authorization||'').replace(/^Bearer\s+/i,'').trim();
 if(!token)throw new Error('OIDC ausente');
 const parts=token.split('.');
 if(parts.length!==3)throw new Error('OIDC malformado');
 const header=decodeJson<{kid?:string;alg?:string}>(parts[0]);
 if(header.alg!=='RS256'||!header.kid)throw new Error('Algoritmo OIDC no autorizado');
 const jwk=(await keys()).find(item=>item.kid===header.kid);
 if(!jwk)throw new Error('Clave OIDC desconocida');
 const key=await crypto.subtle.importKey('jwk',jwk as JsonWebKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeBase64Url(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
 if(!verified)throw new Error('Firma OIDC inválida');
 return assertGitHubActionsClaims(decodeJson<Claims>(parts[1]));
}
