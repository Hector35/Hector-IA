import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {CONTEXT_HUB_BUILTINS,contextRecordIsCurrent,isSafeContextEndpoint,normalizeContextRecordType} from '../worker/lib/context-hub';

describe('Héctor Context Hub',()=>{
  it('normalizes structured memory types without inventing unsupported kinds',()=>{
    expect(normalizeContextRecordType('decision')).toBe('decision');
    expect(normalizeContextRecordType('PERSON')).toBe('person');
    expect(normalizeContextRecordType('unknown')).toBe('fact');
  });

  it('respects validity windows and superseded records',()=>{
    const now=Date.parse('2026-08-22T13:00:00Z');
    expect(contextRecordIsCurrent({status:'active',valid_from:'2026-08-22T12:00:00Z',valid_until:'2026-08-22T14:00:00Z'},now)).toBe(true);
    expect(contextRecordIsCurrent({status:'active',valid_until:'2026-08-22T12:59:59Z'},now)).toBe(false);
    expect(contextRecordIsCurrent({status:'superseded'},now)).toBe(false);
  });

  it('only allows same-origin API endpoints and blocks recursive executor routes',()=>{
    expect(isSafeContextEndpoint('/api/files')).toBe(true);
    expect(isSafeContextEndpoint('/api/context-hub/remember')).toBe(true);
    expect(isSafeContextEndpoint('/api/context-hub/execute')).toBe(false);
    expect(isSafeContextEndpoint('https://example.com/api')).toBe(false);
    expect(isSafeContextEndpoint('/api/../control')).toBe(false);
  });

  it('publishes the universal memory and tool operations',()=>{
    const capabilities=CONTEXT_HUB_BUILTINS.map(x=>x.capability);
    expect(capabilities).toContain('context.remember');
    expect(capabilities).toContain('context.recall');
    expect(capabilities).toContain('context.current_state');
    expect(capabilities).toContain('context.history');
    expect(capabilities).toContain('context.search_everything');
    expect(capabilities).toContain('context.capabilities');
    expect(capabilities).toContain('context.resume');
    expect(capabilities).toContain('context.snapshot');
  });

  it('wires D1 memory vault, R2 snapshots, tool registry and approval resumption',()=>{
    const migration=readFileSync('migrations/0042_context_hub.sql','utf8');
    const route=readFileSync('worker/routes/context-hub.ts','utf8');
    const entry=readFileSync('worker/secure-entry.ts','utf8');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS context_hub_records');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS context_hub_tools');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS context_hub_tool_runs');
    expect(migration).toContain('trg_context_hub_tool_approval_resume');
    expect(route).toContain("contextHub.post('/remember'");
    expect(route).toContain("contextHub.post('/recall'");
    expect(route).toContain("contextHub.post('/search-everything'");
    expect(route).toContain("contextHub.post('/execute'");
    expect(route).toContain('c.env.FILES.put');
    expect(entry).toContain("contextHubApi.route('/api/context-hub',contextHub)");
  });
});
