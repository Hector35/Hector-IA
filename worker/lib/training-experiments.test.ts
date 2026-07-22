import {describe,expect,it} from 'vitest';
import {claimNextTrainingExperiment,claimTrainingLease,decidePromotion,rankTrainingCandidates,trainingControlBenchmark,type TrainingCapabilityCandidate} from './training-experiments';

class LeaseDb{
  rows=new Map<string,any>();
  prepare(sql:string){
    return{bind:(...args:any[])=>({
      run:async()=>{
        if(sql.includes('INSERT INTO training_capability_leases')){
          const[capability_key,experiment_id,owner_slot,hypothesis,benchmark_key,files_json,cost_limit_usd,acquired_at,lease_expires_at]=args,existing=this.rows.get(capability_key);
          if(!existing||existing.status!=='active'||existing.lease_expires_at<=acquired_at||existing.owner_slot===owner_slot)this.rows.set(capability_key,{capability_key,experiment_id,owner_slot,hypothesis,benchmark_key,files_json,cost_limit_usd,status:'active',acquired_at,lease_expires_at});
        }
        return{success:true,meta:{changes:1}};
      },
      first:async()=>this.rows.get(args[0])??null
    })};
  }
}

const candidate=(capabilityKey:string,overrides:Partial<TrainingCapabilityCandidate>={}):TrainingCapabilityCandidate=>({
  capabilityKey,
  benchmarkKey:`${capabilityKey}-v1`,
  hypothesis:`mejorar ${capabilityKey}`,
  files:[`worker/lib/${capabilityKey}.ts`],
  expectedGain:.1,
  transfer:.8,
  successProbability:.8,
  estimatedMinutes:40,
  estimatedCostUsd:0,
  conflictRisk:.1,
  ...overrides
});

describe('training experiment control',()=>{
  it('prioriza ganancia transferible por tiempo y conflicto',()=>{
    const ranked=rankTrainingCandidates([
      candidate('lento',{expectedGain:.2,estimatedMinutes:120,conflictRisk:.8}),
      candidate('transversal',{expectedGain:.12,transfer:.95,estimatedMinutes:30,conflictRisk:.05})
    ]);
    expect(ranked[0].capabilityKey).toBe('transversal');
  });

  it('impide que dos slots reclamen simultáneamente la misma capacidad',async()=>{
    const db=new LeaseDb() as any,now=new Date('2026-07-22T13:00:00.000Z'),item=candidate('planning');
    const first=await claimTrainingLease(db,{candidate:item,ownerSlot:'slot-1',now});
    const second=await claimTrainingLease(db,{candidate:item,ownerSlot:'slot-2',now});
    expect(first?.ownerSlot).toBe('slot-1');
    expect(second).toBeNull();
  });

  it('cambia automáticamente a la siguiente debilidad cuando la primera está ocupada',async()=>{
    const db=new LeaseDb() as any,now=new Date('2026-07-22T13:00:00.000Z'),planning=candidate('planning',{expectedGain:.2}),verification=candidate('verification',{expectedGain:.12});
    await claimTrainingLease(db,{candidate:planning,ownerSlot:'slot-1',now});
    const next=await claimNextTrainingExperiment(db,{candidates:[planning,verification],ownerSlot:'slot-4',now});
    expect(next?.lease.capabilityKey).toBe('verification');
    expect(next?.lease.ownerSlot).toBe('slot-4');
  });

  it('permite recuperar una capacidad después de expirar el lease',async()=>{
    const db=new LeaseDb() as any,item=candidate('causal-reasoning');
    await claimTrainingLease(db,{candidate:item,ownerSlot:'slot-1',leaseMinutes:5,now:new Date('2026-07-22T13:00:00.000Z')});
    const recovered=await claimTrainingLease(db,{candidate:item,ownerSlot:'slot-4',now:new Date('2026-07-22T13:06:00.000Z')});
    expect(recovered?.ownerSlot).toBe('slot-4');
  });

  it('promueve solo mejora no vista reproducible y sin regresión crítica',()=>{
    expect(decidePromotion({baselineScore:.6,candidateScore:.7,holdoutScore:.65,transferScore:.66,regressionScore:.005,reproducible:true,rollbackReady:true}).promote).toBe(true);
    expect(decidePromotion({baselineScore:.6,candidateScore:.8,holdoutScore:.62,transferScore:.7,regressionScore:0,reproducible:true,rollbackReady:true}).promote).toBe(false);
    expect(decidePromotion({baselineScore:.6,candidateScore:.7,holdoutScore:.66,transferScore:.67,regressionScore:.02,reproducible:true,rollbackReady:true}).promote).toBe(false);
  });

  it('benchmark del controlador usa cero llamadas avanzadas',()=>{
    const result=trainingControlBenchmark();
    expect(result).toMatchObject({first:'verification',promote:true,advancedCalls:0});
    expect(result.priorityGap).toBeGreaterThan(0);
  });
});
