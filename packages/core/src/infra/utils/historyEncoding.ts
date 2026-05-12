/**
 * **历史记录名称编码**：把 `{ 'zh-CN', 'en-US' }` 压成单字符串前缀 + JSON，写入 `HistoryManager` 的 `name` 字段；
 * Web 侧按同一前缀解析展示。与 `encodeHistoryPayload`（机器可读 op）互补。
 */
import { VIZON_HISTORY_KEYS } from './keys';

/** 写入历史栈的双语展示名（与 apps/web 解码约定一致）。 */
export type HistoryI18nName = {
  'zh-CN': string;
  'en-US': string;
};

export function encodeHistoryI18nName(name: HistoryI18nName): string {
  return `${VIZON_HISTORY_KEYS.I18N_PREFIX}${JSON.stringify(name)}`;
}
