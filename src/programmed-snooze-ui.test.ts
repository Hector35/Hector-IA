import {describe,expect,it} from 'vitest';
import {snoozedRunAt} from './programmed-snooze-ui';

describe('snoozedRunAt',()=>{
 it('adds one hour to a future execution',()=>{const now=new Date('2026-07-22T10:00:00.000Z');expect(snoozedRunAt('2026-07-22T11:30:00.000Z',now).toISOString()).toBe('2026-07-22T12:30:00.000Z');});
 it('uses the current time when the stored execution is overdue',()=>{const now=new Date('2026-07-22T10:00:00.000Z');expect(snoozedRunAt('2026-07-22T09:30:00.000Z',now).toISOString()).toBe('2026-07-22T11:00:00.000Z');});
 it('recovers from an invalid date and enforces a positive delay',()=>{const now=new Date('2026-07-22T10:00:00.000Z');expect(snoozedRunAt('invalid',now,0).toISOString()).toBe('2026-07-22T10:01:00.000Z');});
});
