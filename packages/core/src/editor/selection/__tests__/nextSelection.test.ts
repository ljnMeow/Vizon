/** `nextSelection` 纯函数。 */
import { describe, expect, it } from 'vitest';

import { computeNextPrimary, computeNextSelectedObjects, computeTransformAttachTarget } from '../nextSelection';

describe('computeNextSelectedObjects', () => {
  it('单选：有拾取则仅该对象', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    expect(computeNextSelectedObjects([a], b, {})).toEqual([b]);
  });

  it('单选：无拾取则清空', () => {
    const a = { id: 'a' };
    expect(computeNextSelectedObjects([a], null, {})).toEqual([]);
  });

  it('toggle：拾取 null 保持原集合', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    expect(computeNextSelectedObjects([a, b], null, { toggle: true })).toEqual([a, b]);
  });

  it('toggle：追加未出现的对象', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    expect(computeNextSelectedObjects([a], b, { toggle: true })).toEqual([a, b]);
  });

  it('toggle：已存在则移除', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    expect(computeNextSelectedObjects([a, b], a, { toggle: true })).toEqual([b]);
  });
});

describe('computeNextPrimary', () => {
  it('空集合为 null', () => {
    expect(computeNextPrimary([])).toBeNull();
  });

  it('取最后一个元素', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    expect(computeNextPrimary([a, b])).toBe(b);
  });
});

describe('computeTransformAttachTarget', () => {
  it('非 toggle 单选且带 targetHandle 时使用 handle', () => {
    const primary = { id: 'p' };
    const handle = { id: 'h' };
    expect(computeTransformAttachTarget(primary, [primary], { targetHandle: handle })).toBe(handle);
  });

  it('toggle 时忽略 targetHandle', () => {
    const primary = { id: 'p' };
    const handle = { id: 'h' };
    expect(computeTransformAttachTarget(primary, [primary], { toggle: true, targetHandle: handle })).toBe(primary);
  });

  it('多选时忽略 targetHandle', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const handle = { id: 'h' };
    expect(computeTransformAttachTarget(b, [a, b], { targetHandle: handle })).toBe(b);
  });
});
