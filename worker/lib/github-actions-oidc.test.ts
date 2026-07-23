import {describe,expect,it} from 'vitest';
import {assertGitHubActionsClaims} from './github-actions-oidc';

const now=2_000_000_000;
const valid={
 iss:'https://token.actions.githubusercontent.com',
 aud:'hector-asi-model-inference',
 exp:now+300,
 nbf:now-10,
 repository:'Hector35/Hector-IA',
 ref:'refs/heads/main',
 workflow_ref:'Hector35/Hector-IA/.github/workflows/hector-custom-model-chat.yml@refs/heads/main',
 event_name:'workflow_dispatch'
};

describe('GitHub Actions OIDC model inference',()=>{
 it('accepts only the authorized main workflow',()=>{
  expect(assertGitHubActionsClaims(valid,now)).toEqual(valid);
 });
 it.each([
  ['repository','otro/repo'],
  ['ref','refs/heads/feature'],
  ['workflow_ref','Hector35/Hector-IA/.github/workflows/otro.yml@refs/heads/main'],
  ['event_name','pull_request'],
  ['aud','otro-servicio'],
  ['iss','https://example.test']
 ])('rejects an invalid %s claim',(field,value)=>{
  expect(()=>assertGitHubActionsClaims({...valid,[field]:value},now)).toThrow();
 });
 it('rejects expired tokens',()=>{
  expect(()=>assertGitHubActionsClaims({...valid,exp:now-100},now)).toThrow('expirado');
 });
});
