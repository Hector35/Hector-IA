import {describe,expect,it} from 'vitest';
import {BOOTSTRAP_EVALS,BOOTSTRAP_VERSION,INITIAL_SKILLS,OWNER_PROFILE,renderBootstrap} from './bootstrap';

describe('intelligence bootstrap',()=>{
  it('contains an explicit version and owner profile',()=>{
    expect(BOOTSTRAP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(OWNER_PROFILE.name).toBe('Héctor');
    expect(OWNER_PROFILE.fullName).toBe('Héctor Raúl Hernández Ruiz');
    expect(OWNER_PROFILE.timezone).toBe('America/Monterrey');
    expect(OWNER_PROFILE.responsePreferences.length).toBeGreaterThanOrEqual(6);
  });

  it('ships critical operational and self-knowledge skills',()=>{
    const ids=INITIAL_SKILLS.map(skill=>skill.id);
    expect(ids).toEqual(expect.arrayContaining(['verify-production','modify-hector-os','manage-memory','self-knowledge','research-current']));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders identity, profile, safety and evidence rules',()=>{
    const rendered=renderBootstrap();
    expect(rendered).toContain('Héctor OS');
    expect(rendered).toContain('modelo externo');
    expect(rendered).toContain('acciones destructivas');
    expect(rendered).toContain('No afirmar éxito');
    expect(rendered).toContain('modelo completo');
    expect(rendered).toContain('Técnico en Electromecánica');
  });

  it('selects ecosystem knowledge when the prompt requests it',()=>{
    const rendered=renderBootstrap('Diferencia OpenAI, Work, Codex y GPT-5.6');
    expect(rendered).toContain('ChatGPT Work');
    expect(rendered).toContain('Codex');
    expect(rendered).toContain('GPT-5.6');
    expect(rendered).toContain('Héctor OS');
  });

  it('includes minimum bootstrap evaluations',()=>{
    expect(BOOTSTRAP_EVALS.length).toBeGreaterThanOrEqual(6);
    expect(BOOTSTRAP_EVALS.map(test=>test.id)).toEqual(expect.arrayContaining(['identity','evidence','style','memory','safety','ecosystem']));
  });
});
