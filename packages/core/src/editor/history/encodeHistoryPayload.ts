/**
 * **机器可读历史名**：`VIZON_HISTORY_KEYS.OP_PREFIX` + `JSON.stringify(payload)`，与 i18n 的 `encodeHistoryI18nName` 并存。
 */
export function encodeHistoryPayload(prefix: string, payload: Record<string, unknown>): string {
  return `${prefix}${JSON.stringify(payload)}`;
}
