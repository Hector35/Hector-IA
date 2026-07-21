import {describe,expect,it} from 'vitest';
import {authorizeBrowserRequest,isPrivateAddress,resolvePublicHost,validateNetworkUrl} from './browser-network-policy.mjs';

describe('browser network policy',()=>{
  it('bloquea rangos privados, reservados y metadata',()=>{
    for(const address of ['127.0.0.1','10.1.2.3','100.64.0.1','169.254.169.254','172.31.0.1','192.168.1.1','198.18.0.1','::1','fd00::1','fe80::1','::ffff:127.0.0.1']){
      expect(isPrivateAddress(address),address).toBe(true);
    }
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('mantiene HTTPS en la navegación principal y bloquea hosts locales',()=>{
    expect(()=>validateNetworkUrl('http://example.com',{mainNavigation:true})).toThrow('HTTPS');
    expect(()=>validateNetworkUrl('https://service.internal')).toThrow('privado');
    expect(()=>validateNetworkUrl('https://user:pass@example.com')).toThrow('Credenciales');
    expect(validateNetworkUrl('https://example.com',{mainNavigation:true}).hostname).toBe('example.com');
  });

  it('rechaza DNS mixto cuando cualquier respuesta apunta a red privada',async()=>{
    const resolver=async()=>[{address:'203.0.113.5',family:4},{address:'10.0.0.5',family:4}];
    await expect(resolvePublicHost('example.com',resolver)).rejects.toThrow('no pública');
  });

  it('autoriza un destino público y conserva esquemas locales no conectados',async()=>{
    const resolver=async()=>[{address:'8.8.8.8',family:4}];
    await expect(authorizeBrowserRequest('https://example.com',{mainNavigation:true,resolver})).resolves.toBeInstanceOf(URL);
    await expect(authorizeBrowserRequest('data:text/plain,ok',{resolver})).resolves.toBeInstanceOf(URL);
  });
});
