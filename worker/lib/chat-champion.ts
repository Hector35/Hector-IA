import rawManifest from '../../model/hector-asi/registry/chat-champion.json';

export type ChatChampion={
 schemaVersion:1;
 runtimeId:string;
 label:string;
 baseModel:string;
 baseRevision:string;
 artifactId:number;
 adapterSha256:string;
 adapterBytes:number;
 sourceRunId:number;
 sourceExperiment:string;
 promotionState:'active';
 rollbackRuntimeId:string|null;
 promotedAt:string;
};

function requireString(value:unknown,name:string){
 if(typeof value!=='string'||!value.trim())throw new Error(`Manifiesto del campeón inválido: ${name}`);
 return value.trim();
}

function requirePositiveInteger(value:unknown,name:string){
 if(!Number.isInteger(value)||Number(value)<=0)throw new Error(`Manifiesto del campeón inválido: ${name}`);
 return Number(value);
}

function parseChampion(value:unknown):ChatChampion{
 if(!value||typeof value!=='object')throw new Error('Manifiesto del campeón inválido');
 const item=value as Record<string,unknown>;
 const schemaVersion=requirePositiveInteger(item.schemaVersion,'schemaVersion');
 if(schemaVersion!==1)throw new Error(`Versión de manifiesto no soportada: ${schemaVersion}`);
 const adapterSha256=requireString(item.adapterSha256,'adapterSha256').toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(adapterSha256))throw new Error('Manifiesto del campeón inválido: adapterSha256');
 const promotedAt=requireString(item.promotedAt,'promotedAt');
 if(Number.isNaN(Date.parse(promotedAt)))throw new Error('Manifiesto del campeón inválido: promotedAt');
 if(item.promotionState!=='active')throw new Error('El modelo del chat no está promovido');
 return Object.freeze({
  schemaVersion:1,
  runtimeId:requireString(item.runtimeId,'runtimeId'),
  label:requireString(item.label,'label'),
  baseModel:requireString(item.baseModel,'baseModel'),
  baseRevision:requireString(item.baseRevision,'baseRevision'),
  artifactId:requirePositiveInteger(item.artifactId,'artifactId'),
  adapterSha256,
  adapterBytes:requirePositiveInteger(item.adapterBytes,'adapterBytes'),
  sourceRunId:requirePositiveInteger(item.sourceRunId,'sourceRunId'),
  sourceExperiment:requireString(item.sourceExperiment,'sourceExperiment'),
  promotionState:'active',
  rollbackRuntimeId:item.rollbackRuntimeId===null?null:requireString(item.rollbackRuntimeId,'rollbackRuntimeId'),
  promotedAt
 });
}

export const CHAT_CHAMPION=parseChampion(rawManifest);

export function chatChampionEvidence(){
 return{
  runtimeId:CHAT_CHAMPION.runtimeId,
  baseModel:CHAT_CHAMPION.baseModel,
  baseRevision:CHAT_CHAMPION.baseRevision,
  artifactId:CHAT_CHAMPION.artifactId,
  adapterSha256:CHAT_CHAMPION.adapterSha256,
  adapterBytes:CHAT_CHAMPION.adapterBytes,
  sourceRunId:CHAT_CHAMPION.sourceRunId,
  promotedAt:CHAT_CHAMPION.promotedAt,
  rollbackRuntimeId:CHAT_CHAMPION.rollbackRuntimeId
 };
}
