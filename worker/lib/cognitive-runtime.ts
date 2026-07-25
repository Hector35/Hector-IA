import {assessProviderResponse,type ProviderQualityAssessment} from './provider-quality';

export type CognitiveEffort='fast'|'standard'|'deep'|'max';
export type CognitiveCriterionKind='base-quality'|'direct-answer'|'numeric-result'|'comparison'|'causal-explanation'|'implementation-evidence'|'freshness-honesty'|'high-stakes-safety';
export type CognitiveCriterion={id:string;kind:CognitiveCriterionKind;label:string;required:true};
export type CognitiveRuntimePlan={version:'1.0.0';effort:CognitiveEffort;maxAttempts:1|2;verificationRequired:boolean;reason:string;criteria:CognitiveCriterion[]};
export type CognitiveCriterionResult=CognitiveCriterion&{passed:boolean;evidence:string};
export type CognitiveVerification={accepted:boolean;score:number;quality:ProviderQualityAssessment;criteria:CognitiveCriterionResult[];failedCriteria:string[];reasons:string[]};
export type CognitiveAttemptTelemetry={attempt:number;phase:'solve'|'repair';provider:string;model:string;verification:CognitiveVerification};
export type CognitiveRuntimeTelemetry={version:'1.0.0';effort:CognitiveEffort;maxAttempts:1|2;reason:string;criteria:Array<Pick<CognitiveCriterion,'id'|'label'>>;attempts:CognitiveAttemptTelemetry[];repairs:number;accepted:boolean;finalScore:number;failedCriteria:string[]};

const MAX_SIGNALS=/\b(maximo razonamiento|razonamiento alto|mas inteligente|verifica a fondo|doble verificacion|no te equivoques|alta precision)\b/i;
const HIGH_STAKES=/\b(salud|medic|dolor|sintoma|dosis|cirugia|legal|demanda|contrato|finanzas|dinero|saldo|banco|inversion|seguridad|vulnerabilidad|secreto|token|contrasena)\b/i;
const NUMERIC=/\b(calcula|cuanto|porcentaje|promedio|suma|resta|multiplica|divide|conversion|convierte|corriente|voltaje|potencia|costo|precio)\b|\d+(?:[.,]\d+)?\s*[+\-*/x×÷]/i;
const COMPARISON=/\b(compara|comparacion|diferencia|mejor|peor|versus|\bvs\b|ventaja|desventaja|alternativa)\b/i;
const CAUSAL=/\b(por que|porque|causa|razon|explica|como funciona|diagnostica|causa raiz)\b/i;
const IMPLEMENTATION=/\b(implementa|programa|codigo|corrige|depura|debug|refactoriza|arquitectura|github|cloudflare|deploy|workflow|pwa|api|base de datos)\b/i;
const FRESHNESS=/\b(hoy|actual|actualmente|ultimo|ultima|reciente|en vivo|precio|noticia|presidente|ceo|version)\b/i;

function normalize(value:string){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();}
function criterion(kind:CognitiveCriterionKind,label:string):CognitiveCriterion{return{id:kind,kind,label,required:true};}
function uniqueCriteria(items:CognitiveCriterion[]){return items.filter((item,index)=>items.findIndex(candidate=>candidate.id===item.id)===index);}

export function createCognitiveRuntimePlan(input:{prompt:string;tier:'fast'|'balanced'|'deep';mode:'single'|'ensemble';reasoning:'low'|'medium'|'high'}):CognitiveRuntimePlan{
 const prompt=normalize(input.prompt),explicitMax=input.reasoning==='high'||MAX_SIGNALS.test(prompt),highStakes=HIGH_STAKES.test(prompt),complex=IMPLEMENTATION.test(prompt)||COMPARISON.test(prompt)||CAUSAL.test(prompt)||prompt.length>=220;
 let effort:CognitiveEffort='fast';
 if(explicitMax)effort='max';else if(input.tier==='deep'||input.mode==='ensemble'||(highStakes&&complex))effort='deep';else if(input.tier==='balanced'||complex||prompt.length>=100)effort='standard';
 const criteria=[criterion('base-quality','La respuesta es utilizable, no está vacía y no contiene marcadores de error.'),criterion('direct-answer','La respuesta atiende directamente la solicitud con cobertura proporcional a su complejidad.')];
 if(NUMERIC.test(prompt))criteria.push(criterion('numeric-result','Incluye el resultado numérico o cálculo solicitado.'));
 if(COMPARISON.test(prompt))criteria.push(criterion('comparison','Compara explícitamente las alternativas y emite una conclusión útil.'));
 if(CAUSAL.test(prompt))criteria.push(criterion('causal-explanation','Explica la relación causal o el mecanismo, no solo la conclusión.'));
 if(IMPLEMENTATION.test(prompt))criteria.push(criterion('implementation-evidence','Incluye acciones concretas y una forma verificable de validar la implementación.'));
 if(FRESHNESS.test(prompt))criteria.push(criterion('freshness-honesty','Distingue lo verificable de lo que requeriría información actual o una fuente externa.'));
 if(highStakes&&(effort==='deep'||effort==='max'))criteria.push(criterion('high-stakes-safety','Incluye límites, supuestos o controles de riesgo apropiados para una decisión sensible.'));
 return{version:'1.0.0',effort,maxAttempts:effort==='fast'?1:2,verificationRequired:effort!=='fast',reason:explicitMax?'el usuario solicitó razonamiento máximo':effort==='deep'?'la tarea requiere análisis profundo o deliberación múltiple':effort==='standard'?'la tarea requiere verificación y una posible reparación':'la tarea es breve y de bajo riesgo',criteria:uniqueCriteria(criteria)};
}

function evaluateCriterion(item:CognitiveCriterion,prompt:string,text:string,searchedWeb:boolean,quality:ProviderQualityAssessment):CognitiveCriterionResult{
 const value=normalize(text),sourceLimit=/(no puedo verificar|sin acceso|no tengo acceso|fuente actual|informacion actual|información actual|requiere verificar|segun una fuente|según una fuente|fecha exacta)/i.test(text);
 let passed=false,evidence='';
 switch(item.kind){
  case'base-quality':passed=quality.accepted;evidence=passed?`calidad heurística ${quality.score}/100`:quality.reasons.join('; ')||`calidad ${quality.score}/100`;break;
  case'direct-answer':{const minimum=prompt.length>=160?80:prompt.length>=80?45:12;passed=text.trim().length>=minimum;evidence=passed?`${text.trim().length} caracteres útiles`:`solo ${text.trim().length}; mínimo esperado ${minimum}`;break;}
  case'numeric-result':passed=/\d/.test(value);evidence=passed?'se detectó un resultado numérico':'no se detectó ningún número en la respuesta';break;
  case'comparison':passed=/(mejor|peor|ventaja|desventaja|mientras|en cambio|frente a|versus|\bvs\b|recomend)/i.test(value);evidence=passed?'se detectó contraste y conclusión':'faltó contraste explícito o recomendación';break;
  case'causal-explanation':passed=/(porque|debido a|por eso|causa|mecanismo|provoca|produce|depende de|se debe a)/i.test(value);evidence=passed?'se detectó una explicación causal':'faltó explicar el mecanismo o la causa';break;
  case'implementation-evidence':{const action=/(crear|modificar|agregar|conectar|ejecutar|configurar|implementar|archivo|ruta|endpoint|funcion|función|comando)/i.test(value),verification=/(prueba|test|build|validar|verificar|smoke|typecheck|evidencia|resultado)/i.test(value);passed=action&&verification;evidence=passed?'incluye acción y validación reproducible':`acción concreta: ${action?'sí':'no'}; validación: ${verification?'sí':'no'}`;break;}
  case'freshness-honesty':passed=searchedWeb||sourceLimit;evidence=passed?(searchedWeb?'se usó información externa verificada':'se declaró el límite de actualidad'):'no se verificó actualidad ni se declaró el límite';break;
  case'high-stakes-safety':passed=/(riesgo|limite|límite|supuesto|verifica|profesional|urgencias|emergencia|no sustituye|consulta|confirmar|umbral)/i.test(value);evidence=passed?'incluye control de riesgo o límite':'faltó explicitar límites o controles de riesgo';break;
 }
 return{...item,passed,evidence};
}

export function verifyCognitiveResponse(input:{prompt:string;text:string;plan:CognitiveRuntimePlan;searchedWeb?:boolean}):CognitiveVerification{
 const prompt=normalize(input.prompt),quality=assessProviderResponse(input.prompt,input.text),criteria=input.plan.criteria.map(item=>evaluateCriterion(item,prompt,input.text,!!input.searchedWeb,quality)),failed=criteria.filter(item=>item.required&&!item.passed),criteriaScore=Math.round(criteria.filter(item=>item.passed).length/Math.max(1,criteria.length)*100),score=Math.round(criteriaScore*.65+quality.score*.35),reasons=[...quality.reasons,...failed.map(item=>`${item.label} ${item.evidence}`)];
 return{accepted:quality.accepted&&failed.length===0,score,quality,criteria,failedCriteria:failed.map(item=>item.id),reasons};
}

function compact(value:string,max:number){if(value.length<=max)return value;const marker='\n[…contenido compactado…]\n',room=max-marker.length,head=Math.ceil(room*.7);return`${value.slice(0,head)}${marker}${value.slice(-(room-head))}`;}

export function renderCognitiveContract(plan:CognitiveRuntimePlan){return`\n\nCONTRATO COGNITIVO ${plan.version}\n- Esfuerzo: ${plan.effort}.\n- Intentos máximos: ${plan.maxAttempts}.\n- Razón: ${plan.reason}.\n- Antes de responder, asegúrate de satisfacer estos criterios observables:\n${plan.criteria.map((item,index)=>`  ${index+1}. ${item.label}`).join('\n')}\n- No muestres razonamiento privado. Entrega únicamente resultados, supuestos, verificaciones y evidencia útil.`;}

export function buildCognitiveRepairPrompt(input:{prompt:string;draft:string;verification:CognitiveVerification;plan:CognitiveRuntimePlan}){
 const failed=input.verification.criteria.filter(item=>!item.passed).map(item=>`- ${item.label} Motivo: ${item.evidence}`).join('\n');
 return`REPARACIÓN COGNITIVA OBLIGATORIA\n\nSOLICITUD ORIGINAL\n${compact(input.prompt,6000)}\n\nRESPUESTA QUE NO SUPERÓ LA VERIFICACIÓN\n${compact(input.draft,12000)}\n\nCRITERIOS FALLIDOS\n${failed||'- La evaluación global de calidad no alcanzó el umbral.'}\n\nCorrige las causas concretas. Conserva lo correcto, elimina afirmaciones no sustentadas y entrega una respuesta final autosuficiente. No describas razonamiento privado, intentos, jueces ni este proceso de reparación.`;
}

export function createCognitiveRuntimeTelemetry(plan:CognitiveRuntimePlan,attempts:CognitiveAttemptTelemetry[]):CognitiveRuntimeTelemetry{
 const final=attempts[attempts.length-1]?.verification;
 return{version:plan.version,effort:plan.effort,maxAttempts:plan.maxAttempts,reason:plan.reason,criteria:plan.criteria.map(item=>({id:item.id,label:item.label})),attempts,repairs:attempts.filter(item=>item.phase==='repair').length,accepted:!!final?.accepted,finalScore:final?.score||0,failedCriteria:final?.failedCriteria||plan.criteria.map(item=>item.id)};
}

export function cognitiveRuntimeManifest(){return{version:'1.0.0',stages:['classify-effort','define-success-criteria','solve','verify','repair-if-needed','publish-trace'],efforts:['fast','standard','deep','max'],maxAttempts:2,verification:'deterministic criteria plus provider-quality assessment',privateReasoningExposed:false};}
