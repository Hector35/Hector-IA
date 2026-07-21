import {describe,expect,it} from 'vitest';
import {authorizeGitHubActionsClaims,type GitHubActionsClaims} from './github-oidc';

const claims=(overrides:Partial<GitHubActionsClaims>):GitHubActionsClaims=>({
  repository:'Hector35/Hector-IA',
  event_name:'workflow_dispatch',
  ref:'refs/heads/main',
  workflow_ref:'Hector35/Hector-IA/.github/workflows/self-improve.yml@refs/heads/main',
  ...overrides
});

describe('authorizeGitHubActionsClaims',()=>{
  it('autoriza cada workflow únicamente dentro de su política',()=>{
    expect(authorizeGitHubActionsClaims(claims({}),'hector-os-self-improve').repository).toBe('Hector35/Hector-IA');
    expect(authorizeGitHubActionsClaims(claims({workflow_ref:'Hector35/Hector-IA/.github/workflows/agent-browser.yml@refs/heads/main'}),'hector-os-evidence').ref).toBe('refs/heads/main');
    expect(authorizeGitHubActionsClaims(claims({workflow_ref:'Hector35/Hector-IA/.github/workflows/pwa-factory.yml@refs/heads/main',ref:'refs/heads/pwa/demo-v1'}),'hector-os-pwa-runner').ref).toBe('refs/heads/pwa/demo-v1');
  });

  it('acepta evidencia posterior a merge desde una referencia de pull request',()=>{
    const value=claims({event_name:'pull_request',ref:'refs/pull/266/merge',workflow_ref:'Hector35/Hector-IA/.github/workflows/agent-merge-smoke.yml@refs/heads/main'});
    expect(authorizeGitHubActionsClaims(value,'hector-os-evidence')).toBe(value);
  });

  it('impide usar un token PWA como runner de programación',()=>{
    const value=claims({workflow_ref:'Hector35/Hector-IA/.github/workflows/pwa-factory.yml@refs/heads/main',ref:'refs/heads/pwa/demo-v1'});
    expect(()=>authorizeGitHubActionsClaims(value,'hector-os-agent-runner')).toThrow('Workflow OIDC no autorizado');
  });

  it('rechaza repositorios, eventos y ramas fuera de la lista',()=>{
    expect(()=>authorizeGitHubActionsClaims(claims({repository:'otro/repo'}),'hector-os-self-improve')).toThrow('Repositorio OIDC no autorizado');
    expect(()=>authorizeGitHubActionsClaims(claims({event_name:'schedule'}),'hector-os-self-improve')).toThrow('Evento OIDC no autorizado');
    expect(()=>authorizeGitHubActionsClaims(claims({ref:'refs/heads/feature'}),'hector-os-self-improve')).toThrow('Referencia OIDC no autorizada');
  });
});
