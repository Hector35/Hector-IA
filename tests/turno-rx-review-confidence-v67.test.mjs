import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,expect,it} from 'vitest';

const source=readFileSync('public/turno-rx/review-confidence-v67.js','utf8');

function runtime(seed={}){
  class Storage{
    constructor(){this.map=new Map(Object.entries(seed));}
    getItem(key){return this.map.has(key)?this.map.get(key):null;}
    setItem(key,value){this.map.set(key,String(value));}
  }
  const localStorage=new Storage();
  const window={fetch:async()=>({ok:true,json:async()=>({})})};
  vm.runInNewContext(source,{Storage,localStorage,window,JSON,String,Set,Map,Array,Object,Boolean,Date});
  return {localStorage,api:window.__pendientesReviewConfidenceV67};
}

describe('Pendientes review confidence v67',()=>{
  it('limpia una revisión cuando una relectura confirma el mismo valor con confianza alta',()=>{
    const key='pendientes-table-v2';
    const before=[{id:'1',category:'Rayos X',bed:'22',name:'ANA',target:'Tórax',needsReview:true,reviewFields:['bed'],manualOverrides:{}}];
    const {localStorage,api}=runtime({[key]:JSON.stringify(before)});
    api.captureHints({patients:[{category:'Rayos X',bed:'22',name:'ANA',target:'Tórax',confidence:{bed:'high'}}]});
    const after=[{...before[0],updatedAt:'2026-08-18T17:00:00.000Z'}];
    localStorage.setItem(key,JSON.stringify(after));
    const [saved]=JSON.parse(localStorage.getItem(key));
    expect(saved.needsReview).toBe(false);
    expect(saved.reviewFields).toEqual([]);
  });

  it('mantiene la revisión cuando la nueva lectura sigue siendo low',()=>{
    const key='pendientes-table-v2';
    const before=[{id:'1',category:'Rayos X',bed:'22',name:'ANA',target:'Tórax',needsReview:true,reviewFields:['bed'],manualOverrides:{}}];
    const {localStorage,api}=runtime({[key]:JSON.stringify(before)});
    api.captureHints({patients:[{category:'Rayos X',bed:'22',name:'ANA',target:'Tórax',confidence:{bed:'low'}}]});
    localStorage.setItem(key,JSON.stringify(before));
    const [saved]=JSON.parse(localStorage.getItem(key));
    expect(saved.needsReview).toBe(true);
    expect(saved.reviewFields).toEqual(['bed']);
  });

  it('no aplica una confirmación alta a otro paciente',()=>{
    const key='pendientes-table-v2';
    const before=[{id:'1',category:'Rayos X',bed:'22',name:'ANA',target:'Tórax',needsReview:true,reviewFields:['bed'],manualOverrides:{}}];
    const {localStorage,api}=runtime({[key]:JSON.stringify(before)});
    api.captureHints({patients:[{category:'Rayos X',bed:'31',name:'LUIS',target:'Tórax',confidence:{bed:'high'}}]});
    localStorage.setItem(key,JSON.stringify(before));
    const [saved]=JSON.parse(localStorage.getItem(key));
    expect(saved.needsReview).toBe(true);
  });
});
