import { describe, expect, it } from 'vitest';
import { VIZON_HISTORY_KEYS } from '../keys';
import {
  decodeHistoryI18nName,
  encodeHistoryI18nName,
  encodeHistoryI18nNameAuto,
} from '../historyI18n';

describe('historyI18n', () => {
  it('encodeHistoryI18nName uses core-aligned prefix', () => {
    const encoded = encodeHistoryI18nName({ 'zh-CN': '移动', 'en-US': 'Move' });
    expect(encoded.startsWith(VIZON_HISTORY_KEYS.I18N_PREFIX)).toBe(true);
    expect(JSON.parse(encoded.slice(VIZON_HISTORY_KEYS.I18N_PREFIX.length))).toEqual({
      'zh-CN': '移动',
      'en-US': 'Move',
    });
  });

  it('decodeHistoryI18nName returns correct locale string', () => {
    const encoded = encodeHistoryI18nName({ 'zh-CN': '网格', 'en-US': 'Grid' });
    expect(decodeHistoryI18nName(encoded, 'zh-CN')).toBe('网格');
    expect(decodeHistoryI18nName(encoded, 'en-US')).toBe('Grid');
  });

  it('encodeHistoryI18nNameAuto does not double-encode', () => {
    const once = encodeHistoryI18nNameAuto('修改场景设置');
    const twice = encodeHistoryI18nNameAuto(once);
    expect(twice).toBe(once);
  });

  it('decodeHistoryI18nName maps legacy zh via regex for en-US', () => {
    expect(decodeHistoryI18nName('修改场景设置', 'en-US')).toBe('Modify scene settings');
  });
});
