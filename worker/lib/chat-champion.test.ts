import {describe,expect,it} from 'vitest';
import {CHAT_CHAMPION,chatChampionEvidence} from './chat-champion';

describe('chat champion manifest',()=>{
 it('contains an active immutable adapter contract',()=>{
  expect(CHAT_CHAMPION.schemaVersion).toBe(1);
  expect(CHAT_CHAMPION.promotionState).toBe('active');
  expect(CHAT_CHAMPION.runtimeId).toMatch(/^hector-asi-qwen15-v\d+$/);
  expect(CHAT_CHAMPION.baseModel).toBe('Qwen/Qwen2.5-1.5B-Instruct');
  expect(CHAT_CHAMPION.baseRevision).toMatch(/^[a-f0-9]{40}$/);
  expect(CHAT_CHAMPION.adapterSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(CHAT_CHAMPION.adapterBytes).toBeGreaterThan(30_000_000);
  expect(CHAT_CHAMPION.artifactId).toBeGreaterThan(0);
  expect(CHAT_CHAMPION.sourceRunId).toBeGreaterThan(0);
  expect(Date.parse(CHAT_CHAMPION.promotedAt)).not.toBeNaN();
 });

 it('publishes exactly the evidence required by the inference callback',()=>{
  expect(chatChampionEvidence()).toEqual({
   runtimeId:CHAT_CHAMPION.runtimeId,
   baseModel:CHAT_CHAMPION.baseModel,
   baseRevision:CHAT_CHAMPION.baseRevision,
   artifactId:CHAT_CHAMPION.artifactId,
   adapterSha256:CHAT_CHAMPION.adapterSha256,
   adapterBytes:CHAT_CHAMPION.adapterBytes,
   sourceRunId:CHAT_CHAMPION.sourceRunId,
   promotedAt:CHAT_CHAMPION.promotedAt,
   rollbackRuntimeId:CHAT_CHAMPION.rollbackRuntimeId
  });
 });
});
