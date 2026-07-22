export type QualityImpactSample={
 createdAt:string;
 estimatedCostUsd:number;
 qualityScore:number;
 qualityAccepted:boolean;
 rating:number|null;
 corrected:boolean;
 routeTier:'fast'|'balanced'|'deep'|string;
 model:string;
};

export type QualityImpactWindow={
 sampleCount:number;
 acceptedCount:number;
 rejectedCount:number;
 negativeRatings:number;
 corrections:number;
 totalCostUsd:number;
 averageCostUsd:number;
 acceptanceRate:number|null;
 averageQualityScore:number|null;
 deepShare:number|null;
};

export type QualityProtectionImpact={
 before:QualityImpactWindow;
 protected:QualityImpactWindow;
 costDeltaUsd:number;
 costDeltaPerResponseUsd:number|null;
 acceptanceRateDelta:number|null;
 qualityScoreDelta:number|null;
 estimatedErrorsAvoided:number|null;
 recoveryObserved:boolean;
 recoveredAt:string|null;
 recoveryHours:number|null;
 confidence:'insufficient'|'low'|'medium'|'high';
};

function finite(value:number){return Number.isFinite(value)?value:0;}
function rate(numerator:number,denominator:number){return denominator>0?numerator/denominator:null;}
function round(value:number,digits=6){const factor=10**digits;return Math.round(value*factor)/factor;}

export function summarizeQualityImpactWindow(samples:QualityImpactSample[]):QualityImpactWindow{
 const sampleCount=samples.length;
 const acceptedCount=samples.filter(x=>x.qualityAccepted).length;
 const rejectedCount=sampleCount-acceptedCount;
 const negativeRatings=samples.filter(x=>x.rating===-1).length;
 const corrections=samples.filter(x=>x.corrected).length;
 const totalCostUsd=round(samples.reduce((sum,x)=>sum+Math.max(0,finite(x.estimatedCostUsd)),0));
 const scored=samples.filter(x=>Number.isFinite(x.qualityScore));
 return{
  sampleCount,acceptedCount,rejectedCount,negativeRatings,corrections,totalCostUsd,
  averageCostUsd:sampleCount?round(totalCostUsd/sampleCount):0,
  acceptanceRate:rate(acceptedCount,sampleCount),
  averageQualityScore:scored.length?round(scored.reduce((sum,x)=>sum+finite(x.qualityScore),0)/scored.length,3):null,
  deepShare:rate(samples.filter(x=>x.routeTier==='deep').length,sampleCount)
 };
}

export function calculateQualityProtectionImpact(input:{
 before:QualityImpactSample[];
 protected:QualityImpactSample[];
 firstSeenAt:string;
 resolvedAt?:string|null;
 minimumSamples?:number;
}):QualityProtectionImpact{
 const before=summarizeQualityImpactWindow(input.before),protectedWindow=summarizeQualityImpactWindow(input.protected);
 const minimumSamples=Math.max(1,input.minimumSamples??5);
 const comparable=before.sampleCount>=minimumSamples&&protectedWindow.sampleCount>=minimumSamples;
 const acceptanceRateDelta=comparable&&before.acceptanceRate!==null&&protectedWindow.acceptanceRate!==null?round(protectedWindow.acceptanceRate-before.acceptanceRate,4):null;
 const qualityScoreDelta=comparable&&before.averageQualityScore!==null&&protectedWindow.averageQualityScore!==null?round(protectedWindow.averageQualityScore-before.averageQualityScore,3):null;
 const expectedRejected=comparable&&before.acceptanceRate!==null?protectedWindow.sampleCount*(1-before.acceptanceRate):null;
 const estimatedErrorsAvoided=expectedRejected===null?null:round(Math.max(0,expectedRejected-protectedWindow.rejectedCount),2);
 const firstSeen=Date.parse(input.firstSeenAt),resolved=input.resolvedAt?Date.parse(input.resolvedAt):NaN;
 const recoveryObserved=Number.isFinite(resolved)&&Number.isFinite(firstSeen)&&resolved>=firstSeen;
 const recoveryHours=recoveryObserved?round((resolved-firstSeen)/3_600_000,2):null;
 const totalSamples=before.sampleCount+protectedWindow.sampleCount;
 const confidence=!comparable?'insufficient':totalSamples>=40?'high':totalSamples>=20?'medium':'low';
 return{
  before,protected:protectedWindow,
  costDeltaUsd:round(protectedWindow.totalCostUsd-before.totalCostUsd),
  costDeltaPerResponseUsd:comparable?round(protectedWindow.averageCostUsd-before.averageCostUsd):null,
  acceptanceRateDelta,qualityScoreDelta,estimatedErrorsAvoided,recoveryObserved,
  recoveredAt:recoveryObserved?new Date(resolved).toISOString():null,recoveryHours,confidence
 };
}
