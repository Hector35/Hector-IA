import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,expect,it} from 'vitest';

const source=readFileSync('public/turno-rx/photo-fingerprint-history-v70.js','utf8');

function runtime(seed=[]){
  class Storage{
    constructor(){this.map=new Map([['pendientes-table-v2',JSON.stringify(seed)]]);}
    getItem(key){return this.map.has(key)?this.map.get(key):null;}
    setItem(key,value){this.map.set(key,String(value));}
  }
  const localStorage=new Storage();
  const window={__pendientesVisionFingerprintV70:null};
  vm.runInNewContext(source,{Storage,localStorage,window,JSON,String,Set,Map,Array,Object,Boolean,Date});
  return {localStorage,window,api:window.__pendientesFingerprintHistoryV70};
}

describe('Pendientes fingerprint history v70',()=>{
  it('conserva el fingerprint anterior y agrega el nuevo cuando una foto actualiza la misma fila',()=>{
    const before=[{id:'1',bed:'22',name:'ANA',target:'Tórax',updatedAt:'a',imageFingerprint:'fp1',imageFingerprints:['fp1']}];
    const {localStorage,window}=runtime(before);
    window.__pendientesVisionFingerprintV70={fingerprint:'fp2',expires:Date.now()+10000};
    localStorage.setItem('pendientes-table-v2',JSON.stringify([{...before[0],target:'Tórax + abdomen',updatedAt:'b'}]));
    const [saved]=JSON.parse(localStorage.getItem('pendientes-table-v2'));
    expect(saved.imageFingerprint).toBe('fp2');
    expect(saved.imageFingerprints).toEqual(['fp1','fp2']);
    expect(window.__pendientesVisionFingerprintV70).toBeNull();
  });

  it('no asigna el fingerprint de una foto a filas antiguas que no cambiaron',()=>{
    const before=[{id:'old',bed:'22',name:'ANA',target:'Tórax',updatedAt:'a',imageFingerprint:'fp1',imageFingerprints:['fp1']}];
    const {localStorage,window}=runtime(before);
    window.__pendientesVisionFingerprintV70={fingerprint:'fp2',expires:Date.now()+10000};
    localStorage.setItem('pendientes-table-v2',JSON.stringify([before[0],{id:'new',bed:'31',name:'LUIS',target:'Tórax',updatedAt:'b',imageFingerprint:''}]));
    const saved=JSON.parse(localStorage.getItem('pendientes-table-v2'));
    expect(saved[0].imageFingerprints).toEqual(['fp1']);
    expect(saved[1].imageFingerprint).toBe('fp2');
    expect(saved[1].imageFingerprints).toEqual(['fp2']);
  });
});