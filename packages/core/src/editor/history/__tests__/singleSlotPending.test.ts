/** 单槽 pending 基线。 */
import { describe, expect, it } from 'vitest';

import {
  createSingleSlotPending,
  seedSingleSlotBaselineIfEmpty,
  takeSingleSlotBaselineOrLive
} from '../singleSlotPending';

describe('singleSlotPending', () => {
  it('seed 仅在空槽时写入', () => {
    const slot = createSingleSlotPending<number>();
    seedSingleSlotBaselineIfEmpty(slot, 10);
    seedSingleSlotBaselineIfEmpty(slot, 20);
    expect(slot.value).toBe(10);
  });

  it('take 有值时清空并返回', () => {
    const slot = createSingleSlotPending<string>();
    slot.value = 'saved';
    expect(takeSingleSlotBaselineOrLive(slot, () => 'live')).toBe('saved');
    expect(slot.value).toBeNull();
  });

  it('take 空槽时用 getLive', () => {
    const slot = createSingleSlotPending<string>();
    expect(takeSingleSlotBaselineOrLive(slot, () => 'live')).toBe('live');
  });
});
