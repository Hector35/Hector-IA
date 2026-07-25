export type ActionRisk='low'|'medium'|'high';
export type ActionCurrency='MXN'|'USD';
export type ActionPreviewInput={
 action:string;
 target:string;
 summary:string;
 fields?:Record<string,string|number|boolean|null>;
 risk:ActionRisk;
 reversible:boolean;
 rollback?:string;
 estimatedCost?:number;
 maximumCost?:number;
 currency?:ActionCurrency;
 maximumRequests?:number;
 expiresInSeconds?:number;
};
export type ActionPreview={
 schemaVersion:1;
 id:string;
 ownerId:string;
 action:string;
 target:string;
 summary:string;
 fields:Record<string,string|number|boolean|null>;
 risk:ActionRisk;
 reversible:boolean;
 rollback:string|null;
 estimatedCost:number;
 maximumCost:number;
 currency:ActionCurrency;
 maximumRequests:number;
 createdAt:string;
 expiresAt:string;
 digest:string;
 approvalPhrase:string;
 executable:false;
 sideEffects:'none';
};
export type ConsentReceipt={
 schemaVersion:1;
 id:string;
 previewId:string;
 ownerId:string;
 previewDigest:string;
 status:'approved-not-executed';
 approvedAt:string;
 expiresAt:string;
 action:string;
 target:string;
 maximumCost:number;
 currency:ActionCurrency;
 maximumRequests:number;
 reversible:boolean;
 rollback:string|null;
 executionEnabled:false;
 sideEffects:'none';
};

export const ACTION_AUTHORITY_MANIFEST={
 version:'1.0.0',
 defaultDecision:'deny',
 executorEnabled:false,
 writeToolsEnabled:[] as string[],
 maximumPreviewLifetimeSeconds:900,
 maximumRequestsPerGrant:10,
 exactApprovalPhraseRequired:true,
 ownerBindingRequired:true,
 costCeilingRequired:true,
 expirationRequired:true,
 reversibleStateRequired:true,
 revocationLedgerImplemented:false,
 executionReceiptImplemented:false,
 principle:'Ninguna acción de escritura se ejecuta sin vista previa exacta, autoridad del propietario, límites y un ejecutor separado explícitamente habilitado.'
} as const;

function cleanText(value:unknown,max:number,label:string){const text=String(value||'').trim();if(!text)throw new Error(`${label} es obligatorio`);if(text.length>max)throw new Error(`${label} excede ${max} caracteres`);return text;}
function finiteMoney(value:unknown,fallback=0){const number=value===undefined?fallback:Number(value);if(!Number.isFinite(number)||number<0)throw new Error('El costo debe ser un número no negativo');return Math.round(number*100)/100;}
function boundedInteger(value:unknown,fallback:number,min:number,max:number,label:string){const number=value===undefined?fallback:Number(value);if(!Number.isInteger(number)||number<min||number>max)throw new Error(`${label} debe estar entre ${min} y ${max}`);return number;}
function stable(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;const object=value as Record<string,unknown>;return`{${Object.keys(object).sort().map(key=>`${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;}
function hex(bytes:ArrayBuffer){return[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');}
export async function digestActionPreview(value:unknown){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value))));}

export async function createActionPreview(ownerId:string,input:ActionPreviewInput,now=new Date()):Promise<ActionPreview>{
 const action=cleanText(input.action,80,'La acción'),target=cleanText(input.target,300,'El objetivo'),summary=cleanText(input.summary,800,'El resumen');
 if(!['low','medium','high'].includes(input.risk))throw new Error('Riesgo inválido');
 const estimatedCost=finiteMoney(input.estimatedCost),maximumCost=finiteMoney(input.maximumCost,estimatedCost);
 if(maximumCost<estimatedCost)throw new Error('El costo máximo no puede ser menor al estimado');
 const maximumRequests=boundedInteger(input.maximumRequests,1,1,ACTION_AUTHORITY_MANIFEST.maximumRequestsPerGrant,'maximumRequests');
 const lifetime=boundedInteger(input.expiresInSeconds,300,30,ACTION_AUTHORITY_MANIFEST.maximumPreviewLifetimeSeconds,'expiresInSeconds');
 const currency=input.currency||'MXN';if(!['MXN','USD'].includes(currency))throw new Error('Moneda inválida');
 const fields=input.fields||{};if(Object.keys(fields).length>20)throw new Error('La vista previa admite máximo 20 campos');
 if(input.reversible&&!input.rollback?.trim())throw new Error('Una acción reversible requiere instrucciones de rollback');
 if(!input.reversible&&input.risk==='high')throw new Error('Las acciones irreversibles de riesgo alto permanecen denegadas');
 const createdAt=now.toISOString(),expiresAt=new Date(now.getTime()+lifetime*1000).toISOString(),id=crypto.randomUUID();
 const unsigned={schemaVersion:1 as const,id,ownerId:cleanText(ownerId,120,'ownerId'),action,target,summary,fields,risk:input.risk,reversible:input.reversible,rollback:input.rollback?.trim()||null,estimatedCost,maximumCost,currency,maximumRequests,createdAt,expiresAt,executable:false as const,sideEffects:'none' as const};
 const digest=await digestActionPreview(unsigned),approvalPhrase=`APROBAR ${digest.slice(0,8).toUpperCase()}`;
 return{...unsigned,digest,approvalPhrase};
}

export async function verifyActionPreview(preview:ActionPreview,ownerId:string,now=new Date()){
 if(preview.schemaVersion!==1)throw new Error('Versión de vista previa inválida');
 if(preview.ownerId!==ownerId)throw new Error('La vista previa pertenece a otro propietario');
 if(preview.executable!==false||preview.sideEffects!=='none')throw new Error('La vista previa no puede ejecutar acciones');
 if(Date.parse(preview.expiresAt)<=now.getTime())throw new Error('La vista previa expiró');
 const {digest,approvalPhrase,...unsigned}=preview;
 const expected=await digestActionPreview(unsigned);
 if(expected!==digest)throw new Error('La vista previa fue modificada');
 if(approvalPhrase!==`APROBAR ${digest.slice(0,8).toUpperCase()}`)throw new Error('La frase de aprobación no coincide');
 return true;
}

export async function approveActionPreview(preview:ActionPreview,ownerId:string,phrase:string,now=new Date()):Promise<ConsentReceipt>{
 await verifyActionPreview(preview,ownerId,now);
 if(phrase.trim()!==preview.approvalPhrase)throw new Error('La aprobación debe coincidir exactamente con la frase mostrada');
 return{schemaVersion:1,id:crypto.randomUUID(),previewId:preview.id,ownerId,previewDigest:preview.digest,status:'approved-not-executed',approvedAt:now.toISOString(),expiresAt:preview.expiresAt,action:preview.action,target:preview.target,maximumCost:preview.maximumCost,currency:preview.currency,maximumRequests:preview.maximumRequests,reversible:preview.reversible,rollback:preview.rollback,executionEnabled:false,sideEffects:'none'};
}
