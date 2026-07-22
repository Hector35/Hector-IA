import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const providers=readFileSync('worker/lib/providers.ts','utf8');
const planned=readFileSync('worker/lib/planned-response.ts','utf8');
const executionPlan=readFileSync('worker/lib/execution-plan.ts','utf8');
const runtime=JSON.parse(readFileSync('model/hector-asi/runtime-registry.json','utf8'));
const manifest=JSON.parse(readFileSync('model/hector-asi/manifests/openai-training-only-v1.json','utf8'));
describe('Hector chat open-model-only policy',()=>{
 it('declares a machine-readable training-only boundary',()=>{expect(runtime.openAI.interactiveChatAllowed).toBe(false);expect(runtime.openAI.role).toBe('training-and-evaluation-only');expect(runtime.operationalBase.routing.interactiveChat).toBe('open-model-only');expect(runtime.operationalBase.routing.failurePolicy).toMatch(/never fallback to OpenAI/);expect(manifest.decision.openAIChatAllowed).toBe(false);expect(manifest.decision.openAIFallbackAllowed).toBe(false);});
 it('removes direct OpenAI transport from the active chat executor',()=>{expect(planned).not.toContain('api.openai.com');expect(planned).not.toContain('callResponses');expect(planned).not.toMatch(/fetch\([^)]*openai/i);expect(planned).toContain('callCloudflare');expect(planned).toContain('callHuggingFaceQwen');expect(planned).toContain('OpenAI: prohibido para responder el chat');});
 it('provider selection never returns OpenAI',()=>{expect(providers).not.toMatch(/return\{provider:'openai'/);expect(providers).toContain("openAIAllowed:false");expect(providers).toContain('qwenConfigured=true');});
 it('forbids open-model to OpenAI fallback',()=>{expect(executionPlan).not.toContain("plan.provider.requested==='cloudflare'&&actual.provider==='openai'");expect(executionPlan).not.toContain("plan.provider.requested==='huggingface'&&actual.provider==='openai'");expect(executionPlan).toContain("actual.provider==='openai'");});
 it('records limitations honestly',()=>{expect(manifest.knownTradeoffs).toContain('interactive chat has no live web search after this policy');expect(manifest.cost.chatOpenAIExpectedUsd).toBe(0);});
});
