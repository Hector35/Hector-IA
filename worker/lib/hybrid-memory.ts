export type HybridMemorySource='experience'|'skill'|'document'|'result'|'rule';
export type HybridMemoryItem={
 id:string;userId:string;sourceType:HybridMemorySource;sourceId:string;title:string;content:string;
 normalizedText:string;tags:string[];verified:boolean;successRate:number;confidence:number;
 estimatedCostUsd:number;createdAt:string|null;updatedAt:string|null;
};
export type HybridMemoryHit=HybridMemoryItem&{lexicalScore:number;tagScore:number;recencyScore:number;qualityScore:number;finalScore:number};
export type HybridMemoryDb={prepare:(sql:string)=>{bind:(...values:unknown[])=>{all:<T>()=>Promise<{results:T[]}>;first?:<T>()=>Promise<T|null>;run?:()=>Promise<unknown>}}};

const STOP=new Set(['para','como','esta','este','esto','desde','hasta','sobre','entre','todos','todas','cada','solo','pero','porque','cuando','donde','quiere','quiero','hacer','hace','hector','the','and','with','from']);
const clamp=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));

export function normalizeMemoryText(value:string){
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s_-]+/g,' ').replace(/\s+/g,' ').trim();
}
export function memoryTokens(value:string){return [...new Set(normalizeMemoryText(value).split(' ').filter(token=>token.length>=3&&!STOP.has(token)))];}
export function lexicalSimilarity(left:string,right:string){
 const a=new Set(memoryTokens(left)),b=new Set(memoryTokens(right));if(!a.size||!b.size)return 0;
 let overlap=0;for(const token of a)if(b.has(token))overlap++;
 const jaccard=overlap/(a.size+b.size-overlap),coverage=overlap/Math.max(1,Math.min(a.size,b.size));
 return clamp(jaccard*.65+coverage*.35);
}
export function memoryRecencyScore(value:string|null|undefined,now=Date.now()){
 const timestamp=value?Date.parse(value):NaN;if(!Number.isFinite(timestamp))return .15;
 return Math.exp(-Math.max(0,(now-timestamp)/86_400_000)/180);
}
export function shouldUseEmbedding(input:{query:string;bestLexicalScore:number;candidateCount:number}){
 const tokens=memoryTokens(input.query);
 if(tokens.length<3||input.candidateCount===0)return false;
 if(input.bestLexicalScore>=.68)return false;
 return input.bestLexicalScore>=.16&&input.bestLexicalScore<.68&&input.candidateCount>=4;
}
export function compressMemoryContext(hits:HybridMemoryHit[],maxChars=4200){
 const selected:string[]=[];let used=0;
 for(const hit of hits){
  const compact=`[${hit.sourceType}:${hit.sourceId}] ${hit.title||hit.normalizedText.slice(0,120)}\n${hit.content.replace(/\s+/g,' ').trim().slice(0,1200)}\nConfianza ${(hit.confidence*100).toFixed(0)}% · Éxito ${(hit.successRate*100).toFixed(0)}%`;
  if(used+compact.length>maxChars)continue;selected.push(compact);used+=compact.length;
 }
 return selected.join('\n\n');
}
function parseTags(value:string|null){try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed.filter(item=>typeof item==='string').slice(0,24):[];}catch{return[];}}
function tagOverlap(query:string,tags:string[]){const queryTokens=new Set(memoryTokens(query));if(!tags.length)return 0;let matched=0;for(const tag of tags)if(memoryTokens(tag).some(token=>queryTokens.has(token)))matched++;return clamp(matched/tags.length);}
function rankItem(query:string,item:HybridMemoryItem,now:number):HybridMemoryHit{
 const lexicalScore=lexicalSimilarity(query,`${item.title} ${item.normalizedText} ${item.tags.join(' ')}`),tagScore=tagOverlap(query,item.tags),recencyScore=memoryRecencyScore(item.updatedAt||item.createdAt,now);
 const qualityScore=clamp(item.confidence*.48+item.successRate*.42+(item.verified?.1:0));
 const finalScore=clamp(lexicalScore*.54+tagScore*.12+recencyScore*.12+qualityScore*.2+(item.estimatedCostUsd>0?.02:0));
 return{...item,lexicalScore,tagScore,recencyScore,qualityScore,finalScore};
}
export function rankHybridMemory(query:string,items:HybridMemoryItem[],options:{limit?:number;minScore?:number;now?:number}={}){
 const now=options.now??Date.now(),limit=Math.max(1,Math.min(20,options.limit??6)),minScore=options.minScore??.28;
 const deduped=new Map<string,HybridMemoryHit>();
 for(const item of items){
  if(!item.verified)continue;const hit=rankItem(query,item,now);if(hit.finalScore<minScore)continue;
  const key=`${item.sourceType}:${item.sourceId}`;const existing=deduped.get(key);if(!existing||hit.finalScore>existing.finalScore)deduped.set(key,hit);
 }
 return[...deduped.values()].sort((a,b)=>b.finalScore-a.finalScore||b.recencyScore-a.recencyScore).slice(0,limit);
}

export async function loadHybridMemory(db:HybridMemoryDb,userId:string,query:string,limit=80):Promise<HybridMemoryItem[]>{
 const safeLimit=Math.max(10,Math.min(160,limit)),normalizedQuery=normalizeMemoryText(query),items:HybridMemoryItem[]=[];
 try{
  const match=memoryTokens(query).map(token=>`"${token.replace(/"/g,'')}"*`).join(' OR ');
  if(match){
   const rows=(await db.prepare(`SELECT m.id,m.user_id,m.source_type,m.source_id,m.title,m.content,m.normalized_text,m.tags_json,m.verified,m.success_rate,m.confidence,m.estimated_cost_usd,m.created_at,m.updated_at FROM memory_items_fts f JOIN memory_items m ON m.id=f.item_id WHERE f.user_id=? AND memory_items_fts MATCH ? AND m.verified=1 ORDER BY bm25(memory_items_fts) LIMIT ?`).bind(userId,match,safeLimit).all<any>()).results;
   for(const row of rows)items.push({id:row.id,userId:row.user_id,sourceType:row.source_type,sourceId:row.source_id,title:row.title||'',content:row.content||'',normalizedText:row.normalized_text||normalizedQuery,tags:parseTags(row.tags_json),verified:row.verified===1,successRate:clamp(Number(row.success_rate)||0),confidence:clamp(Number(row.confidence)||0),estimatedCostUsd:Math.max(0,Number(row.estimated_cost_usd)||0),createdAt:row.created_at||null,updatedAt:row.updated_at||null});
  }
 }catch{}
 try{
  const rows=(await db.prepare("SELECT id,user_id,objective,objective_normalized,result,skills_json,verified,attempts,estimated_cost_usd,created_at FROM agent_experiences WHERE user_id=? AND status='completed' AND verified=1 AND result IS NOT NULL ORDER BY created_at DESC LIMIT ?").bind(userId,safeLimit).all<any>()).results;
  for(const row of rows){const attempts=Math.max(1,Number(row.attempts)||1),confidence=clamp(.95-(attempts-1)*.06);items.push({id:`experience:${row.id}`,userId:row.user_id,sourceType:'experience',sourceId:row.id,title:row.objective||'',content:row.result||'',normalizedText:row.objective_normalized||normalizeMemoryText(row.objective||''),tags:parseTags(row.skills_json),verified:row.verified===1,successRate:confidence,confidence,estimatedCostUsd:Math.max(0,Number(row.estimated_cost_usd)||0),createdAt:row.created_at||null,updatedAt:row.created_at||null});}
 }catch{}
 return items;
}
export async function retrieveHybridMemory(db:HybridMemoryDb,userId:string,query:string,options:{limit?:number;maxContextChars?:number}={}){
 const items=await loadHybridMemory(db,userId,query),hits=rankHybridMemory(query,items,{limit:options.limit});
 const bestLexicalScore=hits[0]?.lexicalScore??0;
 return{hits,context:compressMemoryContext(hits,options.maxContextChars),embeddingRecommended:shouldUseEmbedding({query,bestLexicalScore,candidateCount:items.length}),sourceCount:items.length};
}

export function stablePromptHash(value:string){let hash=2166136261;for(const char of normalizeMemoryText(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(16).padStart(8,'0');}
export async function readSemanticCache<T>(db:HybridMemoryDb,userId:string,namespace:string,prompt:string):Promise<T|null>{
 try{const hash=stablePromptHash(prompt),row=await db.prepare("SELECT response_json FROM semantic_cache WHERE user_id=? AND namespace=? AND prompt_hash=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP) LIMIT 1").bind(userId,namespace,hash).first?.<{response_json:string}>();if(!row)return null;return JSON.parse(row.response_json) as T;}catch{return null;}
}
export async function writeSemanticCache(db:HybridMemoryDb,input:{userId:string;namespace:string;prompt:string;response:unknown;confidence:number;evidenceFingerprint?:string;ttlSeconds?:number}){
 try{const promptHash=stablePromptHash(input.prompt),normalizedPrompt=normalizeMemoryText(input.prompt),expiresAt=input.ttlSeconds?new Date(Date.now()+Math.max(60,input.ttlSeconds)*1000).toISOString():null,id=`cache:${input.userId}:${input.namespace}:${promptHash}`;
  await db.prepare("INSERT INTO semantic_cache(id,user_id,namespace,prompt_hash,normalized_prompt,response_json,evidence_fingerprint,confidence,expires_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,namespace,prompt_hash) DO UPDATE SET response_json=excluded.response_json,evidence_fingerprint=excluded.evidence_fingerprint,confidence=excluded.confidence,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP").bind(id,input.userId,input.namespace,promptHash,normalizedPrompt,JSON.stringify(input.response),input.evidenceFingerprint||'',clamp(input.confidence),expiresAt).run?.();return true;
 }catch{return false;}
}
export async function invalidateSemanticCache(db:HybridMemoryDb,userId:string,namespace:string){try{await db.prepare('DELETE FROM semantic_cache WHERE user_id=? AND namespace=?').bind(userId,namespace).run?.();return true;}catch{return false;}}
