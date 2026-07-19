import {describe,expect,it} from 'vitest';
import {BOOTSTRAP_EVALS,BOOTSTRAP_VERSION,INITIAL_SKILLS,OWNER_PROFILE,renderBootstrap} from './bootstrap';

describe('intelligence bootstrap',()=>{
  it('contains an explicit version and owner profile',()=>{
    expect(BOOTSTRAP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(OWNER_PROFILE.name).toBe('Héctor');
    expect(OWNER_PROFILE.responsePreferences.length).toBeGreaterThanOrEqual(5);
  });

  it('ships critical operational skills',()=>{
    const ids=INITIAL_SKILLS.map(skill=>skill.id);
    expect(ids).toContain('verify-production');
    expect(ids).toContain('modify-hector-os');
    expect(ids).toContain('manage-memory');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders identity, profile, safety and evidence rules',()=>{
    const rendered=renderBootstrap();
    expect(rendered).toContain('Héctor OS');
    expect(rendered).toContain('modelo externo');
    expect(rendered).toContain('acciones destructivas');
    expect(rendered).toContain('No afirmar éxito');
    expect(rendered).toContain('modelo completo');
  });

  it('includes minimum bootstrap evaluations',()=>{
    expect(BOOTSTRAP_EVALS.length).toBeGreaterThanOrEqual(5);
    expect(BOOTSTRAP_EVALS.map(test=>test.id)).toEqual(expect.arrayContaining(['identity','evidence','style','memory','safety']));
  });
});
