export type ForecastContextRow={recent_chars?:number|null;summary_chars?:number|null;system_chars?:number|null;memory_chars?:number|null;project_chars?:number|null};

function finiteChars(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>0?Math.floor(n):0;}

export function combineForecastContextChars(clientChars:unknown,row:ForecastContextRow,maxChars=500000){
 const total=finiteChars(clientChars)+finiteChars(row.recent_chars)+finiteChars(row.summary_chars)+finiteChars(row.system_chars)+finiteChars(row.memory_chars)+finiteChars(row.project_chars);
 return Math.min(Math.max(0,Math.floor(maxChars)),total);
}

export async function loadForecastContextChars(db:D1Database,userId:string,clientChars=0){
 const row=await db.prepare(`WITH latest AS (
   SELECT id FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 1
  ), recent AS (
   SELECT COALESCE(SUM(LENGTH(content)),0) chars FROM (
    SELECT content FROM messages WHERE conversation_id=(SELECT id FROM latest) ORDER BY created_at DESC LIMIT 16
   )
  )
  SELECT
   (SELECT chars FROM recent) recent_chars,
   COALESCE((SELECT LENGTH(summary) FROM conversation_summaries WHERE user_id=? AND conversation_id=(SELECT id FROM latest) LIMIT 1),0) summary_chars,
   COALESCE((SELECT SUM(LENGTH(category)+LENGTH(content)+4) FROM system_context WHERE active=1),0) system_chars,
   COALESCE((SELECT SUM(LENGTH(content)+2) FROM (SELECT content FROM memories WHERE user_id=? ORDER BY importance DESC,updated_at DESC LIMIT 12)),0) memory_chars,
   COALESCE((SELECT SUM(LENGTH(kind)+LENGTH(status)+LENGTH(COALESCE(result,''))+24) FROM (SELECT kind,status,result FROM work_jobs WHERE user_id=? ORDER BY updated_at DESC LIMIT 3)),0) project_chars`).bind(userId,userId,userId,userId).first<ForecastContextRow>();
 return combineForecastContextChars(clientChars,row||{});
}
