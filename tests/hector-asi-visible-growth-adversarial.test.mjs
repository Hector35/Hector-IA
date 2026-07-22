import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const app=readFileSync('src/HectorASIEvolutionApp.tsx','utf8');
const compact=readFileSync('src/hector-asi-evolution-compact.css','utf8');
const main=readFileSync('src/main.tsx','utf8');
const manifest=JSON.parse(readFileSync('model/hector-asi/evals/visible-growth-adversarial-v2.json','utf8'));

function indexOrFail(source,value){
  const index=source.indexOf(value);
  expect(index,`Missing ${value}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('Hector ASI adversarial visible-growth contract',()=>{
  it('keeps the useful story in the main surface rather than the technical overlay',()=>{
    const home=indexOrFail(app,'function EvolutionHome');
    const visible=indexOrFail(app,'className="eaVisibleGrowth"');
    const actions=indexOrFail(app,'className="eaPrimaryActions"');
    const sheet=indexOrFail(app,'function EvolutionSheet');

    expect(visible).toBeGreaterThan(home);
    expect(visible).toBeLessThan(actions);
    expect(visible).toBeLessThan(sheet);
    for(const label of manifest.mobileGates.requiredWithoutOpeningDetails){
      expect(app.slice(home,sheet)).toContain(label);
    }
  });

  it('derives claims from runtime and registry evidence instead of fixed progress',()=>{
    expect(app).toContain("const abilities=(selfModel?.capabilities||[]).slice(0,4)");
    expect(app).toContain('previous&&previous!==evolution.signature');
    expect(app).toContain('capabilities:selfModel?.capabilities?.map');
    expect(app).toContain('latestEvaluation:selfModel?.runtime?.latestEvaluation');
    expect(app).toContain('candidate?.baseModel?.repository');
    expect(app).not.toMatch(/Inteligencia:\s*\d|ASI completada:\s*\d|Neuronas:\s*[+\d]/i);
  });

  it('adds a short-height viewport guard instead of relying on source strings alone',()=>{
    expect(main).toContain("import './hector-asi-evolution-compact.css'");
    expect(compact).toContain('@media (max-width:420px) and (max-height:700px)');
    expect(compact).toContain('.eaOrganism{width:132px}');
    expect(compact).toContain('.eaVisibleGrowth{margin-top:7px;gap:5px}');
    expect(compact).toContain('.eaUnlockCard small,.eaNextUnlock small{display:none}');
  });

  it('preserves accessible primary touch targets on the smallest supported view',()=>{
    const match=compact.match(/\.eaPrimaryActions button\{[^}]*min-height:(\d+)px/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(manifest.mobileGates.minimumPrimaryTouchTargetPx);
  });

  it('keeps reduced-motion support in the base interface and adds no new dependency',()=>{
    const base=readFileSync('src/hector-asi-evolution.css','utf8');
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    expect(base).toContain('@media(prefers-reduced-motion:reduce)');
    expect(pkg.devDependencies?.['@playwright/test']).toBeUndefined();
    expect(manifest.costUsd).toBe(0);
  });
});
