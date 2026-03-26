export function getAssetUrl(assetPath: string, importerUrl: string) {
  return new URL(assetPath, importerUrl).href;
}

/**
 * Copy plain text to clipboard.
 * - Prefer Clipboard API
 * - Fallback to legacy execCommand (cast to `any` to avoid TS deprecation warnings)
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // Clipboard API (recommended)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continue to fallback
  }

  // Legacy fallback: best-effort (avoid TS deprecation via `any` cast)
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

