/** `encodeHistoryI18nName` 与前缀约定。 */
import { describe, expect, it } from 'vitest';
import { VIZON_HISTORY_KEYS } from '../keys';
import { encodeHistoryI18nName } from '../historyEncoding';

describe('encodeHistoryI18nName', () => {
  it('prefixes JSON-serialized bilingual name', () => {
    const name = { 'zh-CN': '移动', 'en-US': 'Move' };
    const encoded = encodeHistoryI18nName(name);
    expect(encoded.startsWith(VIZON_HISTORY_KEYS.I18N_PREFIX)).toBe(true);
    expect(encoded).toBe(`${VIZON_HISTORY_KEYS.I18N_PREFIX}${JSON.stringify(name)}`);
  });
});
