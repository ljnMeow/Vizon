import { VIZON_HISTORY_KEYS } from './keys';

/** 写入历史栈的双语展示名（与 apps/web 解码约定一致）。 */
export type HistoryI18nName = {
  'zh-CN': string;
  'en-US': string;
};

export function encodeHistoryI18nName(name: HistoryI18nName): string {
  return `${VIZON_HISTORY_KEYS.I18N_PREFIX}${JSON.stringify(name)}`;
}
