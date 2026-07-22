const uniq=(values)=>[...new Set(values.filter(Boolean))];

export function baselinePlanner(task){
  return {
    id:`${task.id}:baseline`,
    strategy:'generic-linear',
    steps:['analizar','implementar','probar','entregar'],
    gates:[],
    rollback:false,
    estimatedAdvancedCalls:1
  };
}

export function cognitivePlanner(task){
  const constraints=uniq(task.constraints||[]);
  const occupied=new Set(task.concurrentFiles||[]);
  const intended=uniq(task.intendedFiles||[]);
  const conflicts=intended.filter((path)=>occupied.has(path));
  const safeFiles=intended.filter((path)=>!occupied.has(path));
  const highRisk=task.risk==='high';
  const deterministic=task.deterministic===true;
  const steps=[];

  steps.push({
    id:'state',
    action:'confirm-state',
    purpose:'Fijar SHA, objetivo, restricciones y evidencia disponible.',
    dependsOn:[],
    exitWhen:'estado y criterio de éxito registrados'
  });

  if(conflicts.length){
    steps.push({
      id:'deconflict',
      action:'select-non-conflicting-scope',
      purpose:`Evitar archivos ocupados: ${conflicts.join(', ')}.`,
      dependsOn:['state'],
      exitWhen:safeFiles.length?'alcance seguro reclamado':'capacidad alternativa reclamada'
    });
  }

  steps.push({
    id:'baseline',
    action:'run-focused-baseline',
    purpose:'Reproducir el fallo o medir el comportamiento campeón antes de cambiarlo.',
    dependsOn:[conflicts.length?'deconflict':'state'],
    exitWhen:'baseline reproducible guardado'
  });

  steps.push({
    id:'candidate',
    action:deterministic?'implement-deterministic-candidate':'implement-minimal-candidate',
    purpose:deterministic?'Resolver con código o herramienta sin llamada avanzada.':'Aplicar la intervención mínima que pueda superar el baseline.',
    dependsOn:['baseline'],
    exitWhen:'candidato ejecutable disponible'
  });

  steps.push({
    id:'verify',
    action:'progressive-validation',
    purpose:'Ejecutar prueba focalizada antes de regresiones y validaciones costosas.',
    dependsOn:['candidate'],
    exitWhen:'criterio cuantitativo superado o candidato descartado'
  });

  if(highRisk){
    steps.push({
      id:'safety',
      action:'require-independent-verification',
      purpose:'Bloquear promoción sin evidencia independiente y rollback.',
      dependsOn:['verify'],
      exitWhen:'evidencia independiente aprobada'
    });
  }

  steps.push({
    id:'handoff',
    action:'package-reusable-result',
    purpose:'Guardar métricas, comandos, artefactos, fallos y siguiente experimento.',
    dependsOn:[highRisk?'safety':'verify'],
    exitWhen:'paquete consumible por el siguiente ciclo'
  });

  return {
    id:`${task.id}:cognitive-plan-v1`,
    strategy:'constraint-aware-dag',
    objective:task.objective,
    constraints,
    conflicts,
    safeFiles,
    steps,
    gates:[
      'no modificar antes de baseline',
      'detener candidato débil temprano',
      'no promover con regresión crítica',
      'conservar rollback y evidencia'
    ],
    rollback:true,
    estimatedAdvancedCalls:deterministic?0:1,
    reusableOutputs:['baseline','manifest','validation-command','negative-result','handoff']
  };
}

export function scorePlan(task,plan){
  const serialized=JSON.stringify(plan).toLowerCase();
  const checks={
    hasBaseline:serialized.includes('baseline'),
    hasDependencies:Array.isArray(plan.steps)&&plan.steps.every((step)=>Array.isArray(step.dependsOn)),
    handlesConflict:(task.concurrentFiles||[]).length===0||serialized.includes('conflict')||serialized.includes('ocupados'),
    progressiveValidation:serialized.includes('progressive-validation')||serialized.includes('prueba focalizada'),
    hasRollback:plan.rollback===true||serialized.includes('rollback'),
    packagesHandoff:serialized.includes('handoff')||serialized.includes('paquete'),
    avoidsAdvancedCall:task.deterministic!==true||plan.estimatedAdvancedCalls===0,
    protectsHighRisk:task.risk!=='high'||serialized.includes('independent-verification')||serialized.includes('evidencia independiente')
  };
  const passed=Object.values(checks).filter(Boolean).length;
  return {score:passed/Object.keys(checks).length,checks};
}

export function comparePlanners(tasks){
  const results=tasks.map((task)=>{
    const baseline=baselinePlanner(task);
    const candidate=cognitivePlanner(task);
    return {
      id:task.id,
      baseline:scorePlan(task,baseline),
      candidate:scorePlan(task,candidate),
      baselinePlan:baseline,
      candidatePlan:candidate
    };
  });
  const mean=(key)=>results.reduce((sum,row)=>sum+row[key].score,0)/Math.max(1,results.length);
  return {
    schemaVersion:'1.0.0',
    caseCount:results.length,
    baselineMean:mean('baseline'),
    candidateMean:mean('candidate'),
    absoluteGain:mean('candidate')-mean('baseline'),
    results
  };
}
