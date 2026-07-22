export type QualityImpactWindow={sampleCount:number;averageCostUsd:number;acceptanceRate:number|null;averageQualityScore:number|null;rejectedCount:number;negativeRatings:number;corrections:number;deepShare:number|null};
export type QualityProtectionImpact={before:QualityImpactWindow;protected:QualityImpactWindow;costDeltaUsd:number;costDeltaPerResponseUsd:number|null;acceptanceRateDelta:number|null;qualityScoreDelta:number|null;estimatedErrorsAvoided:number|null;recoveryObserved:boolean;recoveredAt:string|null;recoveryHours:number|null;confidence:'insufficient'|'low'|'medium'|'high'};
export type QualityImpactResponse={alert:{id:string;task:string;state:'active'|'resolved';firstSeenAt:string;resolvedAt:string|null};impact:QualityProtectionImpact};
export type QualityImpactVerdict='too-early'|'effective'|'recovered-reasonable-cost'|'high-cost-no-proof'|'candidate-probe'|'neutral';
export type QualityImpactSummary={verdict:QualityImpactVerdict;title:string;detail:string;tone:'good'|'warning'|'neutral';metrics:string[]};

function pct(value:number|null){return value===null?'—':`${value>=0?'+':''}${Math.round(value*100)} pp`;}
function score(value:number|null){return value===null?'—':`${value>=0?'+':''}${value.toFixed(1)} pts`;}
function usd(value:number|null){return value===null?'—':`US$${Math.abs(value).toFixed(value<.01?4:3)}${value<0?' menos':''}`;}

export function summarizeQualityProtectionImpact(data:QualityImpactResponse):QualityImpactSummary{
 const i=data.impact;
 const metrics=[`Aceptación ${pct(i.acceptanceRateDelta)}`,`Calidad ${score(i.qualityScoreDelta)}`,`Costo/respuesta ${usd(i.costDeltaPerResponseUsd)}`,`Errores evitados ${i.estimatedErrorsAvoided===null?'—':i.estimatedErrorsAvoided.toFixed(1)}`];
 if(i.confidence==='insufficient')return{verdict:'too-early',title:'Demasiado pronto para evaluar',detail:`Se requieren al menos cinco muestras comparables antes y después. Hay ${i.before.sampleCount} previas y ${i.protected.sampleCount} protegidas.`,tone:'neutral',metrics};
 const acceptance=i.acceptanceRateDelta??0,quality=i.qualityScoreDelta??0,cost=i.costDeltaPerResponseUsd??0,errors=i.estimatedErrorsAvoided??0;
 const improved=acceptance>=.1||quality>=5||errors>=1;
 const expensive=cost>=.02;
 if(i.recoveryObserved&&improved&&!expensive)return{verdict:'recovered-reasonable-cost',title:'Calidad recuperada con costo razonable',detail:`La categoría se recuperó en ${i.recoveryHours??0} h y la evidencia respalda mantener la protección hasta completar una prueba controlada.`,tone:'good',metrics};
 if(improved)return{verdict:'effective',title:'Protección efectiva',detail:`La protección mejoró la calidad${errors>0?` y evitó aproximadamente ${errors.toFixed(1)} errores`:''}.${expensive?' El costo adicional es material y conviene seguir vigilándolo':''}`,tone:'good',metrics};
 if(expensive&&acceptance<=0&&quality<=0)return{verdict:'high-cost-no-proof',title:'Costo alto sin mejora demostrable',detail:'Terra o Sol aumentaron el costo sin una mejora comparable en aceptación o calidad. Conviene volver a automático o ejecutar una prueba controlada.',tone:'warning',metrics};
 if(data.alert.state==='resolved'||i.recoveryObserved)return{verdict:'candidate-probe',title:'Candidata para prueba controlada',detail:'La categoría ya se estabilizó y no existe una mejora fuerte que justifique mantener protección permanente.',tone:'warning',metrics};
 return{verdict:'neutral',title:'Impacto todavía inconcluso',detail:'Hay evidencia comparable, pero el cambio en costo y calidad aún no permite una decisión clara.',tone:'neutral',metrics};
}
