import { useEffect, useMemo, useState } from 'react';

export type ImagePreviewDialogProps = {
  open: boolean;
  fileUrl: string | null;
  title: string;
  loadingText: string;
  unsupportedText?: string;
  errorText?: string;
  closeText: string;
  onClose: () => void;
};

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

  const isValid = useMemo(() => Boolean(open && fileUrl), [open, fileUrl]);

  useEffect(() => {
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

