/**
 * 将相对于当前模块的资源路径解析为可用的绝对 URL 字符串。
 *
 * 使用 `new URL(assetPath, importerUrl)` 解析，这样 Vite 打包后路径仍然正确。
 * 调用方通常传入 `import.meta.url` 作为 importerUrl。
 */
export function getAssetUrl(assetPath: string, importerUrl: string) {
  return new URL(assetPath, importerUrl).href;
}

/**
 * 将纯文本复制到剪贴板。
 *
 * 优先使用现代 Clipboard API；如不可用，则降级到 execCommand 兼容方案。
 * - 成功返回 true，失败（包括权限被拒绝）返回 false
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 优先使用 Clipboard API（推荐）
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 权限拒绝或不支持，继续降级
  }

  // 降级方案：通过隐藏 textarea + execCommand('copy') 实现
  // 使用 `any` 规避 TS 对 execCommand 的弃用警告
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';

    document.body.appendChild(ta);
    ta.select();
    const ok = (document as any).execCommand?.('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
  }
}

