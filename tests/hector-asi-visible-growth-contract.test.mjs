import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const source=readFileSync('src/HectorASIEvolutionApp.tsx','utf8');
const contract=JSON.parse(readFileSync('model/hector-asi/evals/visible-growth-ui-v1.json','utf8'));

describe('Hector ASI visible growth contract',()=>{
  it('shows the useful growth story without requiring interaction',()=>{
    for(const label of contract.requiredVisibleWithoutInteraction){
      expect(source).toContain(label);
    }
    expect(contract.interactionBudget.tapsToUnderstandCurrentGrowth).toBe(0);
  });

  it('uses plain capability labels backed by the self model',()=>{
    for(const label of contract.requiredPlainCapabilities){
      expect(source).toContain(label);
    }
    expect(source).toContain('selfModel?.capabilities');
  });

  it('answers honestly about the open-weight model in development',()=>{
    expect(source).toContain('Hector ASI tiene un modelo propio en desarrollo');
    expect(source).toContain('candidate?.baseModel?.repository');
    expect(source).toContain('evolution.methodName');
    expect(source).toContain("evolution.championId||'aún no existe'");
  });

  it('does not introduce fake intelligence progress metrics',()=>{
    for(const claim of contract.forbiddenClaims){
      expect(source).not.toContain(claim);
    }
  });

  it('only celebrates when the persisted evolution signature changes',()=>{
    expect(source).toContain("previous&&previous!==evolution.signature");
    expect(source).toContain('setEvolutionNotice(visibleAchievement(evolution,selfModel).title)');
  });
});
