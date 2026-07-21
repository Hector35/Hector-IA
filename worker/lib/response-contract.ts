export type ResponseContractResult={text:string;applied:boolean;reasons:string[]};

const ignorance=/(?:\bno lo s[eé]\b|\bno tengo (?:ese|el|esa|la) dato\b|\bno (?:se|me) (?:ha )?proporcion(?:ó|ado)\b|\bnunca me has proporcionado\b|\bdesconozco\b|\bno dispongo de (?:ese|el|esa|la) dato\b)/i;
const conciseConstraint=/(?:responde|contesta)\s+(?:solo|solamente|únicamente)|(?:no|sin)\s+expli(?:ques|car)|solo lo que realmente sabes/i;

function firstSentence(text:string){
 const cleaned=text.trim().replace(/^#+\s*/,'').replace(/^[-*•]\s*/,''),match=cleaned.match(/^([\s\S]*?[.!?])(?:\s|$)/);
 return(match?.[1]||cleaned.split(/\n\s*\n/)[0]||cleaned).trim();
}

function lineLimit(input:string){
 const match=input.match(/(?:máximo|m[aá]ximo|exactamente|no m[aá]s de)\s+(\d{1,2})\s+l[ií]neas?/i);
 if(!match)return null;
 return Math.max(1,Math.min(20,Number(match[1])));
}

export function enforceResponseContract(input:string,output:string):ResponseContractResult{
 let text=String(output||'').trim(),applied=false;const reasons:string[]=[];
 if(!text)return{text,applied:false,reasons};

 if(conciseConstraint.test(input)&&ignorance.test(text)){
  text='No lo sé.';applied=true;reasons.push('ignorancia explícita reducida al formato solicitado');
 }

 if(/(?:responde|contesta)\s+(?:solo|únicamente)\s+con\s+(?:sí|si)\s+o\s+no/i.test(input)){
  const answer=text.match(/(?:^|[^\p{L}])(sí|si|no)(?=$|[^\p{L}])/iu)?.[1];
  if(answer){const normalized=/^no$/i.test(answer)?'No':'Sí';if(text!==normalized){text=normalized;applied=true;reasons.push('respuesta binaria normalizada');}}
 }

 if(/(?:responde|contesta)\s+(?:solo|únicamente)\s+con\s+una\s+palabra/i.test(input)){
  const word=text.replace(/^#+\s*/,'').replace(/^[-*•]\s*/,'').match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/u)?.[0];
  if(word&&text!==word){text=word;applied=true;reasons.push('respuesta limitada a una palabra');}
 }

 if(conciseConstraint.test(input)&&!ignorance.test(text)&&/(?:no|sin)\s+expli(?:ques|car)/i.test(input)){
  const concise=firstSentence(text);if(concise&&concise!==text){text=concise;applied=true;reasons.push('explicación adicional eliminada');}
 }

 const maxLines=lineLimit(input);
 if(maxLines){const lines=text.split(/\r?\n/).filter(line=>line.trim().length);if(lines.length>maxLines){text=lines.slice(0,maxLines).join('\n');applied=true;reasons.push(`salida limitada a ${maxLines} líneas`);}}

 return{text,applied,reasons};
}
