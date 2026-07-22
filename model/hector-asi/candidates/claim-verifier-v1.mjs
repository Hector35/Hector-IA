const ACTIONS=[
 {id:'deploy',pattern:/\b(desplegu[eé]|deploy(?:ed)?|publicad[oa] en producci[oó]n)\b/i,evidence:/\b(deploy|deployment|preview|production|workers\.dev|commit sha)\b/i},
 {id:'merge',pattern:/\b(fusion[eé]|merge(?:d)?|integrad[oa] a main)\b/i,evidence:/\b(pull request|\bpr\b|merge commit|merged|main)\b/i},
 {id:'test',pattern:/\b(prob[eé]|tests? pasaron|validaci[oó]n completada|checks? verdes)\b/i,evidence:/\b(test|vitest|typecheck|build|workflow|check|exit code)\b/i},
 {id:'train',pattern:/\b(entren[eé]|fine[- ]?tun(?:e|ed)|qlora|lora entrenad[oa]|checkpoint generado)\b/i,evidence:/\b(checkpoint|adapter|loss|epoch|training run|artifact hash|sha256)\b/i}
];
const CURRENT=/\b(hoy|actual(?:mente)?|m[aá]s reciente|[uú]ltim[oa]|ahora mismo|vigente)\b/i;
const ABSOLUTE=/\b(100\s*%|garantizad[oa]|sin ninguna duda|siempre|nunca falla|completamente seguro)\b/i;
const numberTokens=text=>[...String(text).matchAll(/(?<![\w.])-?\d+(?:[.,]\d+)?%?/g)].map(x=>x[0].replace(',','.'));
const evidenceText=evidence=>evidence.map(item=>typeof item==='string'?item:[item.type,item.text,item.url,item.sha,item.date].filter(Boolean).join(' ')).join('\n');
const dateMs=value=>{const t=Date.parse(value||'');return Number.isFinite(t)?t:null};
export function verifyClaim({answer,evidence=[],now='2026-07-22T16:00:00Z'}){
 const text=String(answer||'').trim(),proof=evidenceText(evidence),reasons=[];
 let score=100;
 if(!text){return{accepted:false,score:0,confidence:0,reasons:['empty-answer']};}
 for(const action of ACTIONS){if(action.pattern.test(text)&&!action.evidence.test(proof)){score-=45;reasons.push(`unsupported-${action.id}`);}}
 if(CURRENT.test(text)){
  const dates=evidence.map(item=>dateMs(typeof item==='string'?'':item.date)).filter(x=>x!==null);
  const freshest=dates.length?Math.max(...dates):null;
  if(freshest===null||dateMs(now)-freshest>45*86400000){score-=35;reasons.push('stale-or-missing-current-source');}
 }
 if(ABSOLUTE.test(text)&&evidence.length<2){score-=25;reasons.push('uncalibrated-certainty');}
 const nums=numberTokens(text).filter(n=>!/^20\d{2}$/.test(n));
 const proofNums=new Set(numberTokens(proof));
 const unsupported=[...new Set(nums.filter(n=>!proofNums.has(n)))];
 if(unsupported.length){score-=Math.min(30,unsupported.length*10);reasons.push(`unsupported-numbers:${unsupported.join(',')}`);}
 if(/\b(checkpoint|campe[oó]n|custom weights?|pesos propios)\b/i.test(text)&&/\b(planned|none|null|false|sin checkpoint|no existe)\b/i.test(proof)&&!/\b(no existe|todav[ií]a no|sin checkpoint|champion:\s*null)\b/i.test(text)){score-=60;reasons.push('registry-contradiction');}
 score=Math.max(0,Math.min(100,score));
 const confidence=Math.round((.35+.0065*score)*100)/100;
 return{accepted:score>=70,score,confidence:Math.min(.99,confidence),reasons};
}
export function naiveBaseline(){return{accepted:true,score:95,confidence:.95,reasons:['accept-all-baseline']};}
