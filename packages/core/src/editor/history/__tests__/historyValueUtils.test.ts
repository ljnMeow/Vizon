/** `historyValueUtils` 克隆与比较。 */
import { describe, expect, it } from 'vitest';

import {
  cloneForHistory,
  formatHistoryValue,
  isHistoryValueEqual,
  readNestedPath,
  readNestedValueCloned
} from '../historyValueUtils';

describe('historyValueUtils', () => {
  it('readNestedPath', () => {
    expect(readNestedPath({ a: { b: 2 } }, 'a.b')).toBe(2);
    expect(readNestedPath(null, 'a')).toBeUndefined();
  });

  it('readNestedValueCloned clones leaf', () => {
    const inner = { x: 1 };
    const root = { o: inner };
    const v = readNestedValueCloned(root, 'o', cloneForHistory) as { x: number };
    expect(v).toEqual(inner);
    expect(v).not.toBe(inner);
  });

  it('isHistoryValueEqual', () => {
    expect(isHistoryValueEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(isHistoryValueEqual(1, 2)).toBe(false);
  });

  it('formatHistoryValue', () => {
    expect(formatHistoryValue(3.14159)).toMatch(/3/);
    expect(formatHistoryValue(true)).toBe('true');
    expect(formatHistoryValue({})).toBe('');
  });
});
