import { ApiError } from '../api/request';

/** 后端无业务 message 时的占位文案，不应直接展示给用户。 */
const PLACEHOLDER_MESSAGES = new Set(['error', 'network error']);

/** 判断接口返回的 message 是否有实际业务含义。 */
export function isMeaningfulApiMessage(message: string | undefined | null): boolean {
  if (!message?.trim()) return false;
  return !PLACEHOLDER_MESSAGES.has(message.trim().toLowerCase());
}

/**
 * 从 API/网络错误中提取可读消息：优先接口 message，否则使用 fallback。
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  let raw = '';
  if (err instanceof ApiError) raw = err.message;
  else if (err instanceof Error) raw = err.message;
  else if (typeof err === 'string') raw = err;
  return isMeaningfulApiMessage(raw) ? raw.trim() : fallback;
}

/** 批量上传失败时合并多条错误文案（去重）。 */
export function mergeUploadErrorMessages(messages: string[]): string {
  return [...new Set(messages.filter(Boolean))].join('；');
}
