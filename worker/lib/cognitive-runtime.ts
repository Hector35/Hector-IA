import {assessProviderResponse,type ProviderQualityAssessment} from './provider-quality';

export type CognitiveEffort='fast'|'standard'|'deep'|'max';
export type CognitiveCriterionKind='base-quality'|'direct-answer'|'numeric-result'|'comparison'|'causal-explanation'|'implementation-evidence'|'code-evidence'|'freshness-honesty'|'uncertainty-calibration'|'high-stakes-safety';
export type CognitiveCriterion={id:string;kind:CognitiveCriterionKind;label:string;required:true};
export type CognitiveRuntimePlan={version:'1.1.0';effort:CognitiveEffort;maxAttempts:1|2;verificationRequired:boolean;reason:string;criteria:CognitiveCriterion[]};
export type CognitiveCriterionResult=CognitiveCriterion&{passed:boolean;evidence:string};
export type CognitiveVerification={accepted:boolean;score:number;quality:ProviderQualityAssessment;criteria:CognitiveCriterionResult[];failedCriteria:string[];reasons:string[]};
export type CognitiveAttemptTelemetry={attempt:number;phase:'solve'|'repair';provider:string;model:string;verification:CognitiveVerification};
export type CognitiveRuntimeTelemetry={version:'1.1.0';effort:CognitiveEffort;maxAttempts:1|2;reason:string;criteria:Array<Pick<CognitiveCriterion,'id'|'label'>>;attempts:CognitiveAttemptTelemetry[];repairs:number;accepted:boolean;finalScore:number;failedCriteria:string[]};

const MAX_SIGNALS=/\b(maximo razonamiento|razonamiento alto|mas inteligente|verifica a fondo|doble verificacion|no te equivoques|alta precision)\b/i;
const HIGH_STAKES=/\b(salud|medic|dolor|sintoma|dosis|cirugia|legal|demanda|contrato|finanzas|dinero|saldo|banco|inversion|seguridad|vulnerabilidad|secreto|token|contrasena)\b/i;
const NUMERIC=/\b(calcula|cuanto|porcentaje|promedio|suma|resta|multiplica|divide|conversion|convierte|corriente|voltaje|potencia|costo|precio)\b|\d+(?:[.,]\d+)?\s*[+\-*/x×÷]\s*-?\d/i;
const COMPARISON=/\b(compara|comparacion|diferencia|mejor|peor|versus|\bvs\b|ventaja|desventaja|alternativa)\b/i;
const CAUSAL=/\b(por que|porque|causa|razon|explica|como funciona|diagnostica|causa raiz)\b/i;
const IMPLEMENTATION=/\b(implementa|programa|codigo|corrige|depura|debug|refactoriza|arquitectura|github|cloudflare|deploy|workflow|pwa|api|base de datos)\b/i;
const CODE=/\b(codigo|programa|funcion|clase|typescript|javascript|python|react|sql|endpoint|api|refactoriza|depura|debug)\b/i;
const FRESHNESS=/\b(hoy|actual|actualmente|ultimo|ultima|reciente|en vivo|precio|noticia|presidente|ceo|version)\b/i;
const UNCERTAINTY=/\b(confianza|certeza|seguro|probable|probabilidad|riesgo|diagnostica|audita|estima)\b/i;

function normalize(value:string){return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();}
function criterion(kind:CognitiveCriterionKind,label:string):CognitiveCriterion{return{id:kind,kind,label,required:true};}
function uniqueCriteria(items:CognitiveCriterion[]){return items.filter((item,index)=>items.findIndex(candidate=>candidate.id===item.id)===index);}

export function createCognitiveRuntimePlan(input:{prompt:string;tier:'fast'|'balanced'|'deep';mode:'single'|'ensemble';reasoning:'low'|'medium'|'high'}):CognitiveRuntimePlan{
 const prompt=normalize(input.prompt),explicitMax=input.reasoning==='high'||MAX_SIGNALS.test(prompt),highStakes=HIGH_STAKES.test(prompt),complex=IMPLEMENTATION.test(prompt)||COMPARISON.test(prompt)||CAUSAL.test(prompt)||prompt.length>=220;
 let effort:CognitiveEffort='fast';
 if(explicitMax)effort='max';else if(input.tier==='deep'||input.mode==='ensemble'||(highStakes&&complex))effort='deep';else if(input.tier==='balanced'||complex||prompt.length>=100)effort='standard';
 const criteria=[criterion('base-quality','La respuesta es utilizable, no está vacía y no contiene marcadores de error.'),criterion('direct-answer','La respuesta atiende directamente la solicitud con cobertura proporcional a su complejidad.')];
 if(NUMERIC.test(prompt))criteria.push(criterion('numeric-result','Incluye el resultado numérico correcto cuando existe una operación verificable.'));
 if(COMPARISON.test(prompt))criteria.push(criterion('comparison','Contrasta explícitamente las alternativas y emite una conclusión útil.'));
 if(CAUSAL.test(prompt))criteria.push(criterion('causal-explanation','Explica el mecanismo causal y sus condiciones, no sólo la conclusión.'));
 if(IMPLEMENTATION.test(prompt))criteria.push(criterion('implementation-evidence','Incluye acción concreta, artefacto identificable, validación y resultado observable.'));
 if(CODE.test(prompt))criteria.push(criterion('code-evidence','Incluye código o archivos concretos y una prueba reproducible con resultado esperado u observado.'));
 if(FRESHNESS.test(prompt))criteria.push(criterion('freshness-honesty','Usa información externa verificada o declara explícitamente el límite de actualidad.'));
 if((highStakes||UNCERTAINTY.test(prompt))&&effort!=='fast')criteria.push(criterion('uncertainty-calibration','Separa hechos, inferencias, incertidumbre y condiciones que cambiarían la conclusión.'));
 if(highStakes&&(effort==='deep'||effort==='max'))criteria.push(criterion('high-stakes-safety','Incluye límites, supuestos o controles de riesgo apropiados para una decisión sensible.'));
 return{version:'1.1.0',effort,maxAttempts:effort==='fast'?1:2,verificationRequired:effort!=='fast',reason:explicitMax?'el usuario solicitó razonamiento máximo':effort==='deep'?'la tarea requiere análisis profundo o deliberación múltiple':effort==='standard'?'la tarea requiere verificación y una posible reparación':'la tarea es breve y de bajo riesgo',criteria:uniqueCriteria(criteria)};
}

function parseNumber(value:string){const cleaned=value.trim().replace(/\s/g,'').replace(',','.');const parsed=Number(cleaned);return Number.isFinite(parsed)?parsed:null;}
function binaryArithmetic(prompt:string){
 const match=prompt.match(/(-?\d+(?:[.,]\d+)?)\s*([+\-*/x×÷])\s*(-?\d+(?:[.,]\d+)?)/i);
 if(!match)return null;
 const left=parseNumber(match[1]),right=parseNumber(match[3]);if(left===null||right===null)return null;
 const operator=match[2].toLowerCase();let expected:number;
 if(operator==='+')expected=left+right;else if(operator==='-')expected=left-right;else if(operator==='*'||operator==='x'||operator==='×')expected=left*right;else{if(right===0)return{expression:match[0],expected:null,error:'división entre cero'};expected=left/right;}
 return{expression:match[0],expected,error:null};
}
function answerNumbers(text:string){return(text.match(/-?\d+(?:[.,]\d+)?/g)||[]).map(parseNumber).filter((value):value is number=>value!==null);}
function closeEnough(actual:number,expected:number){return Math.abs(actual-expected)<=Math.max(1e-6,Math.abs(expected)*1e-4);}

function evaluateCriterion(item:CognitiveCriterion,prompt:string,text:string,searchedWeb:boolean,quality:ProviderQualityAssessment):CognitiveCriterionResult{
 const value=normalize(text),sourceLimit=/(no puedo verificar|sin acceso|no tengo acceso|fuente actual|informacion actual|requiere verificar|debe confirmarse|fecha exacta)/i.test(text);
 let passed=false,evidence='';
 switch(item.kind){
  case'base-quality':passed=quality.accepted;evidence=passed?`calidad heurística ${quality.score}/100`:quality.reasons.join('; ')||`calidad ${quality.score}/100`;break;
  case'direct-answer':{const minimum=prompt.length>=160?80:prompt.length>=80?45:12;passed=text.trim().length>=minimum;evidence=passed?`${text.trim().length} caracteres útiles`:`solo ${text.trim().length}; mínimo esperado ${minimum}`;break;}
  case'numeric-result':{const arithmetic=binaryArithmetic(prompt),numbers=answerNumbers(text);if(arithmetic?.error){passed=/(no definida|indefinida|division entre cero|división entre cero|no se puede dividir)/i.test(value);evidence=passed?'detectó división entre cero':'no reconoció que la división entre cero es inválida';}else if(arithmetic&&arithmetic.expected!==null){const found=numbers.find(number=>closeEnough(number,arithmetic.expected!));passed=found!==undefined;evidence=passed?`resultado ${found} coincide con ${arithmetic.expression}`:`no se encontró ${arithmetic.expected} para ${arithmetic.expression}`;}else{passed=numbers.length>0;evidence=passed?'se detectó un resultado numérico':'no se detectó ningún número en la respuesta';}break;}
  case'comparison':{const contrast=/(mientras|en cambio|frente a|versus|\bvs\b|por otro lado|diferencia|ventaja|desventaja)/i.test(value),conclusion=/(recomiend|conviene|mejor opcion|mejor opción|elegir|conclusion|conclusión)/i.test(value);passed=contrast&&conclusion;evidence=passed?'incluye contraste y conclusión':`contraste: ${contrast?'sí':'no'}; conclusión: ${conclusion?'sí':'no'}`;break;}
  case'causal-explanation':{const mechanism=/(porque|debido a|se debe a|mecanismo|provoca|produce|conduce a|depende de)/i.test(value),condition=/(si |cuando |depende|condicion|condición|salvo|excepto|limite|límite)/i.test(value);passed=mechanism&&condition;evidence=passed?'incluye mecanismo y condición':'faltó mecanismo causal o condición de validez';break;}
  case'implementation-evidence':{const action=/(crear|modificar|agregar|conectar|ejecutar|configurar|implementar|archivo|ruta|endpoint|funcion|función|comando)/i.test(value),artifact=/(\/[a-z0-9_.\-/]+|[a-z0-9_.-]+\.(?:ts|tsx|js|py|json|yml|yaml|sql|md)|commit|pr\s*#?\d+|sha-?256|endpoint)/i.test(value),verification=/(prueba|test|build|validar|verificar|smoke|typecheck|evidencia)/i.test(value),outcome=/(pas[oó]|correctamente|sin errores|0 fallos|exit code 0|success|exitoso|resultado observado|sha-?256|commit|pr\s*#?\d+)/i.test(value);passed=action&&artifact&&verification&&outcome;evidence=passed?'incluye acción, artefacto, validación y resultado':`acción ${action?'sí':'no'}; artefacto ${artifact?'sí':'no'}; validación ${verification?'sí':'no'}; resultado ${outcome?'sí':'no'}`;break;}
  case'code-evidence':{const code=/```[a-z0-9_-]*\n[\s\S]+?```/i.test(text)||/[a-z0-9_.-]+\.(?:ts|tsx|js|py|sql)\b/i.test(value),test=/(pytest|vitest|jest|npm test|npm run test|typecheck|assert|prueba|test)/i.test(value),result=/(pass|pas[oó]|correctamente|expected|esperado|sin errores|0 fallos|exit code 0)/i.test(value);passed=code&&test&&result;evidence=passed?'incluye código/archivo, prueba y resultado':`código/archivo ${code?'sí':'no'}; prueba ${test?'sí':'no'}; resultado ${result?'sí':'no'}`;break;}
  case'freshness-honesty':passed=searchedWeb||sourceLimit;evidence=passed?(searchedWeb?'se usó información externa verificada':'se declaró el límite de actualidad'):'no se verificó actualidad ni se declaró el límite';break;
  case'uncertainty-calibration':{const separation=/(hecho|observacion|observación|inferencia|supuesto|incertidumbre|confianza|probable|no se puede concluir)/i.test(value),revision=/(cambiaria|cambiaría|confirmar|verificar|si aparece|si se obtiene|nueva evidencia|depende de)/i.test(value);passed=separation&&revision;evidence=passed?'calibra incertidumbre y condición de revisión':`incertidumbre explícita ${separation?'sí':'no'}; condición de revisión ${revision?'sí':'no'}`;break;}
  case'high-stakes-safety':passed=/(riesgo|limite|límite|supuesto|verifica|profesional|urgencias|emergencia|no sustituye|consulta|confirmar|umbral)/i.test(value);evidence=passed?'incluye control de riesgo o límite':'faltó explicitar límites o controles de riesgo';break;
 }
 return{...item,passed,evidence};
}

export function verifyCognitiveResponse(input:{prompt:string;text:string;plan:CognitiveRuntimePlan;searchedWeb?:boolean}):CognitiveVerification{
 const prompt=normalize(input.prompt),quality=assessProviderResponse(input.prompt,input.text),criteria=input.plan.criteria.map(item=>evaluateCriterion(item,prompt,input.text,!!input.searchedWeb,quality)),failed=criteria.filter(item=>item.required&&!item.passed),criteriaScore=Math.round(criteria.filter(item=>item.passed).length/Math.max(1,criteria.length)*100),score=Math.round(criteriaScore*.75+quality.score*.25),reasons=[...quality.reasons,...failed.map(item=>`${item.label} ${item.evidence}`)];
 return{accepted:quality.accepted&&failed.length===0,score,quality,criteria,failedCriteria:failed.map(item=>item.id),reasons};
}

function compact(value:string,max:number){if(value.length<=max)return value;const marker='\n[…contenido compactado…]\n',room=max-marker.length,head=Math.ceil(room*.7);return`${value.slice(0,head)}${marker}${value.slice(-(room-head))}`;}

export function renderCognitiveContract(plan:CognitiveRuntimePlan){return`\n\nCONTRATO COGNITIVO ${plan.version}\n- Esfuerzo: ${plan.effort}.\n- Intentos máximos: ${plan.maxAttempts}.\n- Razón: ${plan.reason}.\n- Antes de responder, satisface estos criterios observables:\n${plan.criteria.map((item,index)=>`  ${index+1}. ${item.label}`).join('\n')}\n- No afirmes que una acción terminó sin aportar artefacto y resultado verificable.\n- No muestres razonamiento privado. Entrega únicamente resultados, supuestos, verificaciones y evidencia útil.`;}

export function buildCognitiveRepairPrompt(input:{prompt:string;draft:string;verification:CognitiveVerification;plan:CognitiveRuntimePlan}){
 const failed=input.verification.criteria.filter(item=>!item.passed).map(item=>`- ${item.label} Motivo: ${item.evidence}`).join('\n');
 return`REPARACIÓN COGNITIVA OBLIGATORIA\n\nSOLICITUD ORIGINAL\n${compact(input.prompt,6000)}\n\nRESPUESTA QUE NO SUPERÓ LA VERIFICACIÓN\n${compact(input.draft,12000)}\n\nCRITERIOS FALLIDOS\n${failed||'- La evaluación global de calidad no alcanzó el umbral.'}\n\nCorrige las causas concretas. Conserva lo correcto, elimina afirmaciones no sustentadas y entrega una respuesta final autosuficiente. No inventes archivos, comandos ejecutados ni resultados. No describas razonamiento privado, intentos, jueces ni este proceso de reparación.`;
}

export function createCognitiveRuntimeTelemetry(plan:CognitiveRuntimePlan,attempts:CognitiveAttemptTelemetry[]):CognitiveRuntimeTelemetry{
 const final=attempts[attempts.length-1]?.verification;
 return{version:plan.version,effort:plan.effort,maxAttempts:plan.maxAttempts,reason:plan.reason,criteria:plan.criteria.map(item=>({id:item.id,label:item.label})),attempts,repairs:attempts.filter(item=>item.phase==='repair').length,accepted:!!final?.accepted,finalScore:final?.score||0,failedCriteria:final?.failedCriteria||plan.criteria.map(item=>item.id)};
}

export function cognitiveRuntimeManifest(){return{version:'1.1.0',stages:['classify-effort','define-success-criteria','solve','verify-arithmetic-and-evidence','repair-if-needed','publish-trace'],efforts:['fast','standard','deep','max'],maxAttempts:2,verification:'deterministic arithmetic, evidence, freshness, calibration and provider-quality assessment',privateReasoningExposed:false};}
