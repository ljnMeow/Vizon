/** 对象属性 pending Map。 */
import { describe, expect, it } from 'vitest';

import { seedObjectPropertyPendingBaseline, takeObjectPropertyHistoryBaseline } from '../objectPropertyPending';

describe('objectPropertyPending', () => {
  it('seed 仅在首次写入', () => {
    const m = new Map<string, number>();
    seedObjectPropertyPendingBaseline(m, 'a::x', 1);
    seedObjectPropertyPendingBaseline(m, 'a::x', 99);
    expect(m.get('a::x')).toBe(1);
  });

  it('take 有 pending 时取出并删除', () => {
    const m = new Map<string, string>();
    m.set('u::p', 'baseline');
    expect(takeObjectPropertyHistoryBaseline(m, 'u::p', 'live')).toBe('baseline');
    expect(m.has('u::p')).toBe(false);
  });

  it('take 无 pending 时用 live', () => {
    const m = new Map<string, string>();
    expect(takeObjectPropertyHistoryBaseline(m, 'u::p', 'live')).toBe('live');
  });
});
