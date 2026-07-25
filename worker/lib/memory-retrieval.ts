export type MemoryCandidate={id:string;content:string;importance:number;updatedAt?:string|null;ownerId?:string};
export type RankedMemory=MemoryCandidate&{score:number;matchedTerms:string[];exactPhrase:boolean};

const STOPWORDS=new Set(['a','al','algo','con','como','de','del','el','ella','en','es','esta','este','la','las','lo','los','me','mi','mis','para','por','que','se','sin','su','sus','un','una','y','the','to','of','my','is','in','on','and']);
const CONCEPTS:Record<string,string[]>={
 preferencia:['prefiere','preferir','gusta','favorito','favorita'],
 trabajo:['trabajar','trabajos','laboral','empleo'],
 modelo:['modelos','llm','cerebro'],
 entrenamiento:['entrenar','training','dataset','corpus'],
 pago:['pagar','pagos','cobro','cobros','quincena'],
 salud:['medico','medica','sintoma'],
 archivo:['archivos','documento','documentos'],
 proyecto:['proyectos','repositorio','repo'],
 presupuesto:['costo','costos','dinero','gasto','gastos','limite','maximo','techo'],
 consentimiento:['aprobar','aprobacion','autoridad','escritura','escrituras','modificar','cambiar','accion','acciones','vista','previa'],
 respuesta:['mostrar','muestra','modelo','real','efectivo','respondio','responde','contesto','contesta'],
 validacion:['validaciones','prueba','pruebas','typecheck','build','migracion','migraciones','produccion'],
 aislamiento:['recuerdo','recuerdos','memoria','memorias','usuario','propietario','otro','cuenta'],
 bloqueo:['bloqueado','bloqueo','cluster','gpu','reanudacion','presupuesto','training','entrenar']
};

export function normalizeMemoryText(value:string){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
function stem(value:string){return value.length>5?value.replace(/(amientos?|imientos?|aciones?|adores?|adoras?|mente|ando|iendo|ados?|adas?|idos?|idas?|es|s)$/,''):value;}
function expand(term:string){const normalized=normalizeMemoryText(term),base=stem(normalized),out=new Set<string>([normalized,base]);for(const [key,values] of Object.entries(CONCEPTS)){const group=[key,...values].map(normalizeMemoryText);if(group.some(item=>item===normalized||stem(item)===base)){for(const item of group){out.add(item);out.add(stem(item));}}}return[...out].filter(item=>item.length>=2);}

export function memorySearchTerms(query:string){const raw=normalizeMemoryText(query).split(' ').filter(term=>term.length>=2&&!STOPWORDS.has(term));const unique=[...new Set(raw.flatMap(expand))];return unique.slice(0,32);}

export function rankMemoryCandidates(query:string,candidates:MemoryCandidate[],limit=5):RankedMemory[]{
 const phrase=normalizeMemoryText(query),terms=memorySearchTerms(query),queryTokens=[...new Set(phrase.split(' ').filter(term=>term.length>=2&&!STOPWORDS.has(term)))];
 return candidates.map(candidate=>{
  const content=normalizeMemoryText(candidate.content),tokens=new Set(content.split(' '));
  const exactPhrase=phrase.length>=4&&content.includes(phrase);
  const matches=(term:string)=>content.includes(term)||tokens.has(term)||[...tokens].some(token=>stem(token)===stem(term));
  const matchedTerms=terms.filter(matches),directMatches=queryTokens.filter(matches).length;
  const coverage=queryTokens.length?directMatches/queryTokens.length:0;
  const semanticBreadth=Math.min(8,matchedTerms.length-directMatches);
  const score=(exactPhrase?8:0)+(directMatches*3.2)+(semanticBreadth*1.15)+(coverage*5)+(Math.max(0,Math.min(5,Number(candidate.importance)||0))*.2);
  return{...candidate,score:Math.round(score*1000)/1000,matchedTerms:[...new Set(matchedTerms)].slice(0,20),exactPhrase};
 }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||b.importance-a.importance||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||a.id.localeCompare(b.id)).slice(0,Math.max(1,Math.min(20,limit)));
}

export function memoryRetrievalMetrics(cases:Array<{query:string;relevantIds:string[]}>,candidates:MemoryCandidate[],k=3){
 let recalled=0,totalRelevant=0,precisionSum=0,reciprocalRankSum=0;
 const results=cases.map(item=>{
  const ranked=rankMemoryCandidates(item.query,candidates,k),ids=ranked.map(candidate=>candidate.id),relevant=new Set(item.relevantIds),hits=ids.filter(id=>relevant.has(id));
  totalRelevant+=relevant.size;recalled+=hits.length;precisionSum+=hits.length/k;
  const first=ids.findIndex(id=>relevant.has(id));if(first>=0)reciprocalRankSum+=1/(first+1);
  return{query:item.query,relevantIds:item.relevantIds,retrievedIds:ids,hits,reciprocalRank:first>=0?1/(first+1):0};
 });
 return{cases:cases.length,k,recallAtK:totalRelevant?recalled/totalRelevant:0,precisionAtK:cases.length?precisionSum/cases.length:0,mrr:cases.length?reciprocalRankSum/cases.length:0,results};
}

export function memoryRetrievalManifest(){return{version:'1.1.0',method:'deterministic lexical-concept ranking',ownerFilterRequired:true,candidateLimit:80,rankingSignals:['exact phrase','direct terms','concept/stem breadth','query coverage','importance'],privateDataRequired:false};}
