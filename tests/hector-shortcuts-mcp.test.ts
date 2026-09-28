import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const bridge=read('worker/routes/hector-bridge.ts');
const mcp=read('worker/routes/hector-mcp.ts');

describe('ChatGPT Apple Shortcuts integration',()=>{
 it('publishes a scoped MCP tool with structured actions',()=>{
  expect(mcp).toContain("name:'apple_shortcut_create'");
  expect(mcp).toContain("path:'/shortcuts/design'");
  expect(mcp).toContain("enum:['none','text','clipboard','share_sheet']");
 });

 it('keeps native installation and permission confirmation explicit',()=>{
  expect(bridge).toContain("createUrl:'shortcuts://create-shortcut'");
  expect(bridge).toContain('requiresUserConfirmation:true');
  expect(bridge).toContain('Apple no permite que una web o ChatGPT instale acciones silenciosamente');
 });
});
