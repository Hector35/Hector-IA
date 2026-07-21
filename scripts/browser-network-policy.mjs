import {isIP} from 'node:net';
import {lookup} from 'node:dns/promises';

const blockedHostSuffixes=['.localhost','.local','.internal','.home','.lan'];

function ipv4ToNumber(address){
  return address.split('.').reduce((value,part)=>(value<<8)+Number(part),0)>>>0;
}

function inIpv4Range(address,base,prefix){
  const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;
  return (ipv4ToNumber(address)&mask)===(ipv4ToNumber(base)&mask);
}

export function isPrivateAddress(address){
  const normalized=address.toLowerCase().split('%')[0];
  if(isIP(normalized)===4){
    return [
      ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
      ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],
      ['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],
      ['224.0.0.0',4],['240.0.0.0',4]
    ].some(([base,prefix])=>inIpv4Range(normalized,base,prefix));
  }
  if(isIP(normalized)!==6)return false;
  if(normalized==='::'||normalized==='::1')return true;
  const mapped=normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if(mapped)return isPrivateAddress(mapped);
  return normalized.startsWith('fc')||normalized.startsWith('fd')||/^fe[89ab]/.test(normalized)||normalized.startsWith('2001:db8:');
}

export function validateNetworkUrl(value,{mainNavigation=false}={}){
  let url;
  try{url=new URL(value);}catch{throw new Error('URL inválida');}
  if(['data:','blob:','about:'].includes(url.protocol))return url;
  if(!['http:','https:'].includes(url.protocol))throw new Error(`Protocolo bloqueado: ${url.protocol}`);
  if(mainNavigation&&url.protocol!=='https:')throw new Error('La navegación principal debe permanecer en HTTPS');
  if(url.username||url.password)throw new Error('Credenciales embebidas no permitidas');
  const hostname=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(!hostname||hostname==='localhost'||blockedHostSuffixes.some(suffix=>hostname.endsWith(suffix)))throw new Error('Host privado o local bloqueado');
  if(isIP(hostname)&&isPrivateAddress(hostname))throw new Error('Dirección privada bloqueada');
  return url;
}

export async function resolvePublicHost(hostname,resolver=lookup){
  const clean=hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(isIP(clean)){
    if(isPrivateAddress(clean))throw new Error('Dirección privada bloqueada');
    return [{address:clean,family:isIP(clean)}];
  }
  const records=await resolver(clean,{all:true,verbatim:true});
  if(!records.length)throw new Error('El host no resolvió direcciones');
  const blocked=records.find(record=>isPrivateAddress(record.address));
  if(blocked)throw new Error(`DNS resolvió una dirección no pública (${blocked.address})`);
  return records;
}

export async function authorizeBrowserRequest(value,options={}){
  const url=validateNetworkUrl(value,options);
  if(['http:','https:'].includes(url.protocol))await resolvePublicHost(url.hostname,options.resolver);
  return url;
}
