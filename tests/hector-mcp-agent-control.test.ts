import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const mcp=read('worker/routes/hector-mcp.ts');

describe('Héctor Bridge MCP agent control',()=>{
  it('exposes persistent Agent lifecycle tools',()=>{
    expect(mcp).toContain("name:'job_list'");
    expect(mcp).toContain("name:'job_status'");
    expect(mcp).toContain("name:'job_resume'");
    expect(mcp).toContain("name:'job_run_now'");
  });

  it('reuses Héctor Agent routes instead of duplicating job state logic',()=>{
    expect(mcp).toContain("import {hectorAgent} from './hector-agent';");
    expect(mcp).toContain("target:'agent'");
    expect(mcp).toContain("path:(args:any)=>`/goals/${encodeURIComponent(String(args?.goalId||''))}`");
    expect(mcp).toContain("path:(args:any)=>`/goals/${encodeURIComponent(String(args?.goalId||''))}/resume`");
    expect(mcp).toContain("path:(args:any)=>`/goals/${encodeURIComponent(String(args?.goalId||''))}/run-now`");
  });

  it('keeps job operations behind the jobs scope',()=>{
    for(const name of ['job_list','job_status','job_resume','job_run_now']){
      const start=mcp.indexOf(`name:'${name}'`);
      expect(start).toBeGreaterThan(-1);
      expect(mcp.slice(start,start+500)).toContain("scope:'jobs'");
    }
  });
});
