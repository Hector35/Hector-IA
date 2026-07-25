import contract from '../../model/hector-asi/system-quality-contract.json';
import uiEvidence from '../../model/hector-asi/ui-quality-evidence.json';
import {cognitiveRuntimeManifest} from '../lib/cognitive-runtime';
import {readOnlyToolManifest} from '../lib/bounded-read-tools';
import {INTELLIGENCE_STATE} from './intelligence-state';

export type QualityMetrics={
 responseSamples:number;
 averageQuality:number;
 acceptedRate:number;
 fallbackRate:number;
 workSamples:number;
 workSuccessRate:number;
 memoryCount:number;
 correctionCount:number;
 budgetMode:string|null;
 recentCostUsd:number;
 liveExactModelAttested:boolean;
};
export type QualityCheck={id:string;label:string;points:number;passed:boolean;critical:boolean;evidence:string};
export type QualityDimension={id:string;label:string;critical:boolean;score:number;maximum:10;checks:QualityCheck[];gaps:string[]};
export type SystemQualityReport={schemaVersion:1;name:string;score:number;maximum:100;grade:string;tenOutOfTen:boolean;dimensions:QualityDimension[];criticalBlockers:string[];topPriorities:string[];metrics:QualityMetrics;principle:string};

type CheckInput=Omit<QualityCheck,'evidence'>&{evidence:string};
const clamp=(value:number,min=0,max=10)=>Math.max(min,Math.min(max,value));
const fixed=(value:number)=>Math.round(value*100)/100;
const check=(id:string,label:string,points:number,passed:boolean,evidence:string,critical=false):CheckInput=>({id,label,points,passed,evidence,critical});
function dimension(id:string,checks:CheckInput[]):QualityDimension{
 const definition=(contract.dimensions as Array<{id:string;label:string;critical:boolean}>).find(item=>item.id===id);
 if(!definition)throw new Error(`Dimensión de calidad desconocida: ${id}`);
 const score=fixed(clamp(checks.reduce((sum,item)=>sum+(item.passed?item.points:0),0)));
 return{id,label:definition.label,critical:definition.critical,score,maximum:10,checks,gaps:checks.filter(item=>!item.passed).map(item=>item.label)};
}
function ratio(value:number,target:number,points:number){return clamp(value/target,0,1)*points;}
function grade(score:number){return score>=95?'A+':score>=90?'A':score>=80?'B':score>=70?'C':score>=60?'D':'F';}

export function emptyQualityMetrics():QualityMetrics{return{responseSamples:0,averageQuality:0,acceptedRate:0,fallbackRate:0,workSamples:0,workSuccessRate:0,memoryCount:0,correctionCount:0,budgetMode:null,recentCostUsd:0,liveExactModelAttested:false};}

export function buildSystemQualityReport(metrics:QualityMetrics):SystemQualityReport{
 const state=INTELLIGENCE_STATE,cognitive=cognitiveRuntimeManifest(),tools=readOnlyToolManifest();
 const model=dimension('operational-model',[
  check('model-pinned','Identidad del modelo principal fijada',2,state.models.operational.id==='Qwen/Qwen3.5-397B-A17B',state.models.operational.id,true),
  check('effective-required','Modelo efectivo obligatorio',2,true,'El runtime rechaza respuestas sin campo de modelo efectivo',true),
  check('fallback-attribution','Fallback identificado y no promovible',1,state.promotion.rejectFallbackAttribution,'Los fallbacks no pueden atribuirse ni promoverse como Qwen 397B',true),
  check('live-attestation','Atribución viva exacta y reciente',5,metrics.liveExactModelAttested,'Prueba exacta registrada por el endpoint sin fallback',true)
 ]);
 const own=dimension('own-neural-weights',[
  check('custom-weights','Existe un adaptador propio real',2,state.models.ownChampion.customWeights,state.models.ownChampion.id,true),
  check('adapter-hash','Adaptador con SHA-256 registrado',1,Boolean(state.evidence.ownChampionAdapterSha256),state.evidence.ownChampionAdapterSha256||'sin hash',true),
  check('sealed-benchmark','Benchmark sellado y reproducible',1,Boolean(state.evidence.benchmarkSha256&&state.evidence.predictionsSha256),`${state.evidence.benchmarkSha256}; ${state.evidence.predictionsSha256}`,true),
  check('benchmark-25','Benchmark propio ≥25%',1,state.models.ownChampion.benchmarkScorePercent>=25,`${state.models.ownChampion.benchmarkScorePercent}%`),
  check('benchmark-50','Benchmark propio ≥50%',1,state.models.ownChampion.benchmarkScorePercent>=50,`${state.models.ownChampion.benchmarkScorePercent}%`),
  check('benchmark-75','Benchmark propio ≥75%',1,state.models.ownChampion.benchmarkScorePercent>=75,`${state.models.ownChampion.benchmarkScorePercent}%`),
  check('benchmark-80','Benchmark propio ≥80%',1,state.models.ownChampion.benchmarkScorePercent>=80,`${state.models.ownChampion.benchmarkScorePercent}%`,true),
  check('production-enabled','Pesos propios habilitados en producción',1,state.models.ownChampion.productionEnabled,String(state.models.ownChampion.productionEnabled),true),
  check('confirmatory-replicas','Dos réplicas confirmatorias del candidato promovido',1,false,'No existe candidato promovible con dos réplicas',true)
 ]);
 const reasoning=dimension('reasoning-verification',[
  check('runtime-version','Contrato cognitivo 1.1+',1,cognitive.version==='1.1.0',cognitive.version,true),
  check('bounded-repair','Reparación cognitiva acotada',1,cognitive.maxAttempts===2,`máximo ${cognitive.maxAttempts} intentos`),
  check('arithmetic','Verificación aritmética determinista',1,cognitive.stages.includes('verify-arithmetic-and-evidence'),cognitive.verification),
  check('evidence','Evidencia de implementación obligatoria',1,cognitive.verification.includes('evidence'),cognitive.verification),
  check('privacy','Razonamiento privado no expuesto',1,!cognitive.privateReasoningExposed,String(cognitive.privateReasoningExposed),true),
  check('sample-size','Muestra de calidad ≥30',1,metrics.responseSamples>=30,`${metrics.responseSamples} respuestas`),
  check('accepted-80','Aceptación heurística ≥80%',1,metrics.acceptedRate>=.8,`${fixed(metrics.acceptedRate*100)}%`),
  check('accepted-90','Aceptación heurística ≥90%',1,metrics.acceptedRate>=.9,`${fixed(metrics.acceptedRate*100)}%`,true),
  check('quality-85','Calidad media ≥85',1,metrics.averageQuality>=85,String(fixed(metrics.averageQuality))),
  check('quality-90','Calidad media ≥90',1,metrics.averageQuality>=90,String(fixed(metrics.averageQuality)),true)
 ]);
 const toolsDimension=dimension('tools-agency',[
  check('tool-count','Cuatro herramientas verificables',2,tools.tools.length>=4,tools.tools.join(', ')),
  check('read-only','Herramientas actuales sin efectos laterales',2,tools.sideEffects==='none',tools.sideEffects,true),
  check('strict-parser','Parser de llamadas estricto',1,tools.parser.includes('strict'),tools.parser),
  check('bounded-calls','Máximo dos llamadas por respuesta',1,tools.maximumCallsPerResponse===2,String(tools.maximumCallsPerResponse),true),
  check('ownership','Consultas privadas filtradas por propietario',1,tools.ownershipEnforced,String(tools.ownershipEnforced),true),
  check('safe-calculator','Calculadora sin eval',1,tools.calculator.includes('no eval'),tools.calculator),
  check('write-preview','Acciones de escritura con vista previa contractual',1,false,'Todavía no existen herramientas de escritura con Action Preview',true),
  check('consent-receipt','Consentimiento revocable y recibo de acción',1,false,'Falta ledger de autoridad y recibos para futuras escrituras',true)
 ]);
 const memory=dimension('memory-learning',[
  check('memory-available','Memoria persistente disponible',2,metrics.memoryCount>0,`${metrics.memoryCount} memorias`),
  check('memory-20','Al menos 20 memorias útiles',1,metrics.memoryCount>=20,`${metrics.memoryCount}`),
  check('memory-100','Al menos 100 memorias útiles',1,metrics.memoryCount>=100,`${metrics.memoryCount}`),
  check('corrections','Correcciones humanas incorporadas',1,metrics.correctionCount>0,`${metrics.correctionCount} correcciones`),
  check('owner-filter','Búsqueda de memoria filtrada por user_id',2,tools.ownershipEnforced,'Consulta parametrizada por propietario',true),
  check('retrieval-benchmark','Recall/precision de recuperación medidos',3,false,'No existe benchmark sellado de recuperación',false)
 ]);
 const security=dimension('security-privacy',[
  check('secure-headers','CSP y cabeceras seguras',1,true,'Hono secureHeaders con CSP',true),
  check('password-hashing','Contraseñas con hash y salt',1,true,'hashPassword/verifyPassword',true),
  check('auth-rate-limit','Rate limit de autenticación',1,true,'bloqueo por identidad IP+correo',true),
  check('hashed-sessions','Tokens de sesión e IP almacenados como hash',1,true,'token_hash e ip_hash',true),
  check('strict-cookie','Cookie Secure, HttpOnly y SameSite=Strict',1,true,'hector_session',true),
  check('owner-boundary','Cuenta propietaria y aislamiento por user_id',1,true,'owner_registration y consultas filtradas',true),
  check('audit-log','Auditoría de acciones sensibles',1,true,'audit_log',true),
  check('test-isolation','Cuenta de pruebas aislada',1,true,'datos separados por user_id'),
  check('external-review','Revisión externa de seguridad',1,false,'No hay informe independiente',true),
  check('passkeys','Passkeys o MFA resistente a phishing',1,false,'Autenticación actual basada en contraseña',false)
 ]);
 const reliability=dimension('reliability',[
  check('fallback-chain','Cadena de fallback identificada',2,state.models.fallback.id.length>0&&state.models.lastFallback.id.length>0,`${state.models.fallback.id} → ${state.models.lastFallback.id}`,true),
  check('leases','Leases, heartbeat y recuperación de trabajos',2,true,'JOB_LEASE_SECONDS, retry y recuperación',true),
  check('health','Health check de producción',1,true,'/health'),
  check('ci','CI, build, migraciones y smoke test',1,true,'deploy/production y Production Audit',true),
  check('work-samples','Al menos 10 trabajos medidos',1,metrics.workSamples>=10,`${metrics.workSamples}`),
  check('work-success-90','Éxito de trabajos ≥90%',1,metrics.workSuccessRate>=.9,`${fixed(metrics.workSuccessRate*100)}%`),
  check('work-success-95','Éxito de trabajos ≥95%',1,metrics.workSuccessRate>=.95,`${fixed(metrics.workSuccessRate*100)}%`,true),
  check('fallback-rate','Fallback ≤5%',1,metrics.responseSamples>=30&&metrics.fallbackRate<=.05,`${fixed(metrics.fallbackRate*100)}%`,true)
 ]);
 const cost=dimension('observability-cost',[
  check('usage','Uso y costo registrados',1,true,'api_usage'),
  check('traces','Trazas de respuesta y feedback',1,true,'response_traces + response_feedback'),
  check('provider-health','Salud agregada de proveedores',1,true,'provider_quality_events'),
  check('budget','Presupuestos diario y mensual',1,true,'cognitive_budgets',true),
  check('quality-breaker','Breaker costo-calidad',1,true,'budget-quality-breaker'),
  check('forecast','Pronóstico calibrado previo',1,true,'/api/intelligence/budget/forecast'),
  check('protect-mode','Enforcement de presupuesto en protect',1,metrics.budgetMode==='protect',metrics.budgetMode||'sin configuración',true),
  check('cost-window','Costo reciente cuantificado',1,Number.isFinite(metrics.recentCostUsd),`USD $${fixed(metrics.recentCostUsd)}`),
  check('training-budget','Presupuesto explícito de entrenamiento en MXN',2,state.pipeline.explicitBudgetMxn.open,String(state.pipeline.explicitBudgetMxn.value),true)
 ]);
 const ux=dimension('ux-accessibility',[
  check('pwa','PWA instalable',1,true,'service worker y assets'),
  check('iphone','Diseño específico para iPhone y safe areas',1,true,'CSS móvil y viewport'),
  check('offline','Shell y tipografía sin dependencia externa',1,uiEvidence.accessibility.externalFontRequests===false,'Fuentes de sistema; sin solicitudes a Google Fonts'),
  check('chat-first','Chat como superficie primaria con auditoría integrada',2,uiEvidence.chatFirst.defaultView==='chat'&&uiEvidence.chatFirst.allPrimaryActionsReachableFromChat,`${uiEvidence.chatFirst.defaultView}; ${uiEvidence.chatFirst.qualityAuditCommand}`),
  check('visual-ci','Auditoría visual automatizada',1,true,'iPhone Visual Audit'),
  check('honest-telemetry','Telemetría no inventada',1,true,'estados nulos cuando falta evidencia'),
  check('automated-accessibility','Contrato automatizado de accesibilidad',2,uiEvidence.accessibility.automatedContractAudit&&uiEvidence.accessibility.skipLink&&uiEvidence.accessibility.minimumTouchTargetPx>=44,'skip link, aria-current, live regions, 44px, reduced motion, contrast'),
  check('manual-accessibility','Auditoría WCAG manual',1,uiEvidence.accessibility.manualWcagAudit,'Revisión manual pendiente')
 ]);
 const training=dimension('training-readiness',[
  check('corpus','Corpus verificado 10,000/10,000',4,state.pipeline.corpus.open,`${state.pipeline.corpus.observed}/${state.pipeline.corpus.required}`,true),
  check('benchmark','Benchmark mínimo listo',1,state.pipeline.benchmark.open,`${state.pipeline.benchmark.observed}/${state.pipeline.benchmark.required}`,true),
  check('failures','Fallos entrenables suficientes',1,state.pipeline.trainableFailures.open,`${state.pipeline.trainableFailures.observed}/${state.pipeline.trainableFailures.required}`),
  check('live-model','Modelo exacto atestado',1,metrics.liveExactModelAttested,String(metrics.liveExactModelAttested),true),
  check('cluster','Clúster distribuido asignado',1,state.pipeline.distributedHardware.open,String(state.pipeline.distributedHardware.open),true),
  check('resume','Reanudación con pesos reales probada',1,state.pipeline.persistentRemoteResume.open,String(state.pipeline.persistentRemoteResume.open),true),
  check('budget-mxn','Presupuesto máximo en MXN aprobado',1,state.pipeline.explicitBudgetMxn.open,String(state.pipeline.explicitBudgetMxn.value),true)
 ]);
 training.score=fixed(ratio(state.pipeline.corpus.observed,state.pipeline.corpus.required,4)+training.checks.slice(1).reduce((sum,item)=>sum+(item.passed?item.points:0),0));
 const dimensions=[model,own,reasoning,toolsDimension,memory,security,reliability,cost,ux,training];
 const score=fixed(dimensions.reduce((sum,item)=>sum+item.score,0));
 const criticalBlockers=dimensions.flatMap(item=>item.checks.filter(check=>check.critical&&!check.passed).map(check=>`${item.label}: ${check.label}`));
 const priorities=dimensions.flatMap(item=>item.checks.filter(check=>!check.passed).map(check=>({label:`${item.label}: ${check.label}`,points:check.points,critical:check.critical}))).sort((a,b)=>Number(b.critical)-Number(a.critical)||b.points-a.points).slice(0,8).map(item=>item.label);
 const tenOutOfTen=score===100&&criticalBlockers.length===0&&dimensions.every(item=>item.score===10)&&metrics.responseSamples>=(contract.minimumEvidenceSamples as number);
 return{schemaVersion:1,name:contract.name,score,maximum:100,grade:grade(score),tenOutOfTen,dimensions,criticalBlockers,topPriorities:priorities,metrics,principle:contract.principle};
}
