import actionAuthority from '../../model/hector-asi/action-authority-contract.json';
import memoryBenchmark from '../../model/hector-asi/evals/memory-retrieval/benchmark-v1-latest.json';
import activeUi from '../../model/hector-asi/active-ui-quality-evidence.json';
import apiSecurity from '../../model/hector-asi/api-security-boundary.json';
import qualityContract from '../../model/hector-asi/system-quality-contract.json';
import type {QualityCheck,QualityDimension,SystemQualityReport} from './system-quality';

function fixed(value:number){return Math.round(value*100)/100;}
function replaceCheck(dimension:QualityDimension,id:string,update:(check:QualityCheck)=>QualityCheck){
 dimension.checks=dimension.checks.map(check=>check.id===id?update(check):check);
}
function recomputeDimension(dimension:QualityDimension){
 dimension.score=fixed(Math.max(0,Math.min(10,dimension.checks.reduce((sum,check)=>sum+(check.passed?check.points:0),0))));
 dimension.gaps=dimension.checks.filter(check=>!check.passed).map(check=>check.label);
}
function grade(score:number){return score>=95?'A+':score>=90?'A':score>=80?'B':score>=70?'C':score>=60?'D':'F';}

export function applyVerifiedQualityEvidence(input:SystemQualityReport):SystemQualityReport{
 const dimensions=input.dimensions.map(dimension=>({...dimension,checks:dimension.checks.map(check=>({...check})),gaps:[...dimension.gaps]}));
 const tools=dimensions.find(item=>item.id==='tools-agency');
 if(tools){
  const previewReady=actionAuthority.defaultDecision==='deny'&&actionAuthority.executorEnabled===false&&actionAuthority.writeToolsEnabled.length===0&&actionAuthority.preview.ownerBound&&actionAuthority.preview.exactAction&&actionAuthority.preview.exactTarget&&actionAuthority.preview.fieldDiff&&actionAuthority.preview.riskDeclared&&actionAuthority.preview.costCeilingRequired&&actionAuthority.preview.expirationRequired&&actionAuthority.preview.highRiskIrreversibleDenied&&actionAuthority.approval.exactPhraseRequired&&actionAuthority.receipt.executionEnabled===false;
  replaceCheck(tools,'write-preview',check=>({...check,passed:previewReady,evidence:`${actionAuthority.name} ${actionAuthority.version}; default=${actionAuthority.defaultDecision}; executor=${actionAuthority.executorEnabled}; sideEffects=${actionAuthority.receipt.sideEffects}`}));
  replaceCheck(tools,'consent-receipt',check=>({...check,passed:false,evidence:`Existe recibo ${actionAuthority.receipt.status}, pero faltan ${actionAuthority.notImplemented.join(', ')}`}));
  recomputeDimension(tools);
 }
 const memory=dimensions.find(item=>item.id==='memory-learning');
 if(memory){
  const benchmarkReady=memoryBenchmark.passed&&memoryBenchmark.containsPrivateUserData===false&&memoryBenchmark.benchmarkExcludedFromTraining&&memoryBenchmark.ownerFilterRequired&&memoryBenchmark.metrics.cases>=20&&memoryBenchmark.metrics.recallAtK>=memoryBenchmark.thresholds.recallAtK&&memoryBenchmark.metrics.precisionAtK>=memoryBenchmark.thresholds.precisionAtK&&memoryBenchmark.metrics.mrr>=memoryBenchmark.thresholds.mrr;
  replaceCheck(memory,'retrieval-benchmark',check=>({...check,passed:benchmarkReady,evidence:`${memoryBenchmark.benchmark}: recall@${memoryBenchmark.metrics.k}=${memoryBenchmark.metrics.recallAtK.toFixed(4)}, precision@${memoryBenchmark.metrics.k}=${memoryBenchmark.metrics.precisionAtK.toFixed(4)}, MRR=${memoryBenchmark.metrics.mrr.toFixed(4)}; ${memoryBenchmark.artifactDigest}`}));
  recomputeDimension(memory);
 }
 const security=dimensions.find(item=>item.id==='security-privacy');
 if(security){
  const boundaryReady=apiSecurity.mutationPolicy.crossOrigin==='deny'&&apiSecurity.mutationPolicy.crossSite==='deny'&&apiSecurity.responsePolicy.apiCache==='no-store'&&apiSecurity.responsePolicy.frameEmbedding==='deny'&&apiSecurity.responsePolicy.requestId&&apiSecurity.compatibility.scheduledHandlerPreserved;
  replaceCheck(security,'secure-headers',check=>({...check,passed:boundaryReady,evidence:`${apiSecurity.name} ${apiSecurity.version}: cross-origin=${apiSecurity.mutationPolicy.crossOrigin}, cross-site=${apiSecurity.mutationPolicy.crossSite}, cache=${apiSecurity.responsePolicy.apiCache}, HSTS=${apiSecurity.responsePolicy.hstsSeconds}s`}));
  recomputeDimension(security);
 }
 const ux=dimensions.find(item=>item.id==='ux-accessibility');
 if(ux){
  const activeChat=activeUi.entrypoint==='src/main.tsx'&&activeUi.activeApplication==='src/HectorChatApp.tsx'&&activeUi.chatFirst.activeAppMounted&&activeUi.chatFirst.defaultSurface==='chat'&&activeUi.chatFirst.qualityTriggerVisible;
  replaceCheck(ux,'chat-first',check=>({...check,passed:activeChat,evidence:`${activeUi.activeApplication} montada por ${activeUi.entrypoint}; auditoría visible=${activeUi.chatFirst.qualityTriggerVisible}`}));
  const original=ux.checks.find(check=>check.id==='accessibility');
  if(original){
   ux.checks=ux.checks.flatMap(check=>check.id==='accessibility'?[
    {id:'automated-accessibility',label:'Auditoría automatizada de accesibilidad activa',points:1,passed:activeUi.accessibility.automatedContractAudit&&activeUi.accessibility.skipLink&&activeUi.accessibility.modalDialogSemantics&&activeUi.accessibility.progressbarSemantics&&activeUi.accessibility.minimumTouchTargetPx>=48&&activeUi.visualAudit.iphoneSe&&activeUi.visualAudit.iphone13Pro,critical:false,evidence:`skip=${activeUi.accessibility.skipLink}; dialog=${activeUi.accessibility.modalDialogSemantics}; touch=${activeUi.accessibility.minimumTouchTargetPx}px; iPhone SE=${activeUi.visualAudit.iphoneSe}; iPhone 13 Pro=${activeUi.visualAudit.iphone13Pro}`},
    {id:'manual-accessibility',label:'Auditoría WCAG manual independiente',points:1,passed:activeUi.accessibility.manualWcagAudit,critical:false,evidence:'La revisión WCAG manual permanece pendiente'}
   ]:check);
  }
  recomputeDimension(ux);
 }
 const score=fixed(dimensions.reduce((sum,dimension)=>sum+dimension.score,0));
 const criticalBlockers=dimensions.flatMap(dimension=>dimension.checks.filter(check=>check.critical&&!check.passed).map(check=>`${dimension.label}: ${check.label}`));
 const topPriorities=dimensions.flatMap(dimension=>dimension.checks.filter(check=>!check.passed).map(check=>({label:`${dimension.label}: ${check.label}`,points:check.points,critical:check.critical}))).sort((a,b)=>Number(b.critical)-Number(a.critical)||b.points-a.points).slice(0,8).map(item=>item.label);
 const tenOutOfTen=score===100&&criticalBlockers.length===0&&dimensions.every(dimension=>dimension.score===10)&&input.metrics.responseSamples>=(qualityContract.minimumEvidenceSamples as number);
 return{...input,score,grade:grade(score),tenOutOfTen,dimensions,criticalBlockers,topPriorities};
}
