export type OperationalSeverity='info'|'warning'|'critical';
export type OperationalSource='quality'|'budget'|'work'|'runner'|'recovery';
export type OperationalNotification={key:string;source:OperationalSource;severity:OperationalSeverity;title:string;message:string;action?:string;createdAt?:string|null;metadata?:Record<string,unknown>};

const severityRank:Record<OperationalSeverity,number>={critical:3,warning:2,info:1};

export function dedupeOperationalNotifications(items:OperationalNotification[]){
 const map=new Map<string,OperationalNotification>();
 for(const item of items){const current=map.get(item.key);if(!current||severityRank[item.severity]>severityRank[current.severity])map.set(item.key,item);}
 return [...map.values()].sort((a,b)=>severityRank[b.severity]-severityRank[a.severity]||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}

export function budgetNotification(input:{dailyPercent:number;monthlyPercent:number;warnPercent:number;state:string}){
 const max=Math.max(input.dailyPercent,input.monthlyPercent);
 if(input.state==='exceeded'||max>=100)return{key:'budget:exceeded',source:'budget',severity:'critical',title:'Presupuesto cognitivo agotado',message:`El consumo alcanzó ${Math.round(max)}% del límite configurado.`,action:'Abrir presupuesto'} as OperationalNotification;
 if(max>=input.warnPercent)return{key:'budget:warning',source:'budget',severity:'warning',title:'Presupuesto cognitivo próximo al límite',message:`El consumo alcanzó ${Math.round(max)}%; el aviso está configurado en ${input.warnPercent}%.`,action:'Revisar presupuesto'} as OperationalNotification;
 return null;
}

export function qualityNotification(row:any):OperationalNotification{
 return{key:`quality:${row.task}`,source:'quality',severity:'warning',title:`Calidad protegida: ${row.task}`,message:String(row.reason||'El ahorro fue suspendido para proteger la calidad.'),action:'Revisar calidad',createdAt:row.last_seen_at||row.updated_at,metadata:{samples:Number(row.sample_count||0)}};
}

export function workNotification(row:any):OperationalNotification{
 const blocked=String(row.status)==='blocked';
 return{key:`work:${row.id}`,source:'work',severity:blocked?'critical':'warning',title:blocked?'Trabajo bloqueado':'Trabajo requiere atención',message:String(row.last_error||row.result||row.title||'El trabajo no pudo completarse.'),action:'Abrir Trabajo',createdAt:row.updated_at,metadata:{kind:row.kind,status:row.status}};
}
