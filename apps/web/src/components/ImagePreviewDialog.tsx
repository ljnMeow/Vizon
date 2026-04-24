import { useEffect, useMemo, useState } from 'react';

/** 图片预览弹窗属性。 */
export type ImagePreviewDialogProps = {
  /** 是否显示弹窗。 */
  open: boolean;
  /** 要预览的图片 URL；为 null 时展示"不支持"提示。 */
  fileUrl: string | null;
  /** 弹窗标题（同时作为图片 alt）。 */
  title: string;
  /** 图片加载中时显示的文案。 */
  loadingText: string;
  /** 文件类型不支持时的提示文案。 */
  unsupportedText?: string;
  /** 图片加载失败时的错误文案。 */
  errorText?: string;
  /** 关闭按钮文案。 */
  closeText: string;
  /** 关闭弹窗的回调。 */
  onClose: () => void;
};

/**
 * 图片预览弹窗：
 * - 支持加载中 / 加载成功 / 加载失败 / 不支持等状态展示
 * - 点击遮罩层可关闭
 */
export function ImagePreviewDialog({
  open,
  fileUrl,
  title,
  loadingText,
  unsupportedText,
  errorText,
  closeText,
  onClose
}: ImagePreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fileUrl 有效时才展示图片
  const isValid = useMemo(() => Boolean(open && fileUrl), [open, fileUrl]);

  useEffect(() => {
    // fileUrl 变化时重置加载状态
    if (!isValid || !fileUrl) return;
    setLoading(true);
    setError(null);
  }, [isValid, fileUrl]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div
        className="w-[min(720px,92vw)] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          <button
            type="button"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={onClose}
          >
            {closeText}
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">{loadingText}</div>
          ) : error ? (
            <div className="text-xs text-[var(--text-muted)]">{error}</div>
          ) : !isValid ? (
            <div className="text-xs text-[var(--text-muted)]">{unsupportedText ?? errorText ?? 'Unsupported'}</div>
          ) : (
            <div className="h-[360px] w-full overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30">
              <img
                src={fileUrl ?? undefined}
                alt={title}
                className="h-full w-full object-contain"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setError(errorText ?? 'Failed to load image.');
                  setLoading(false);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

