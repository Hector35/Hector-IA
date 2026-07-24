import {describe,expect,it} from 'vitest';
import type {Bindings} from '../types';
import {QWEN_397_OPERATIONAL,hasQwen397Endpoint,qwen397Status} from './qwen397-runtime';
const env=(values:Partial<Bindings>={}):Bindings=>values as Bindings;
describe('Qwen 397B runtime',()=>{
 it('pins the intended open MoE architecture',()=>{expect(QWEN_397_OPERATIONAL.repository).toBe('Qwen/Qwen3.5-397B-A17B');expect(QWEN_397_OPERATIONAL.totalParameters).toBe('397B');expect(QWEN_397_OPERATIONAL.activeParameters).toBe('17B');expect(QWEN_397_OPERATIONAL.multimodal).toBe(true);});
 it('does not claim activation without endpoint and token',()=>{const status=qwen397Status(env({QWEN_397B_ENABLED:'true'}));expect(status.endpointConfigured).toBe(false);expect(status.mode).toBe('pending-endpoint');expect(hasQwen397Endpoint(env({QWEN_397B_BASE_URL:'https://example.invalid/v1'}))).toBe(false);});
 it('enables routing only with both endpoint and token',()=>{const configured=env({QWEN_397B_ENABLED:'true',QWEN_397B_BASE_URL:'https://example.invalid/v1',QWEN_397B_TOKEN:'secret'});expect(hasQwen397Endpoint(configured)).toBe(true);expect(qwen397Status(configured).mode).toBe('endpoint');});
});
