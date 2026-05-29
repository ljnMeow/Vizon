/**
 * 贴图资源选择器：弹出下拉面板，展示指定分类的贴图资源供选择。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { type TextureCategory, type TextureMeta, fetchTexturesPage } from '../api/textures';
import { useLocale } from '../hooks/useLocale';
import { useInfiniteScrollList } from '../hooks/useInfiniteScrollList';
import { appMessages } from '../i18n/messages';
import { ListScrollFooter } from './ListScrollFooter';
import { Tooltip } from './Tooltip';

export interface TexturePickerProps {
  category: TextureCategory;
  onSelect: (meta: TextureMeta) => void;
  disabled?: boolean;
  /** 触发按钮文案 */
  label: string;
  /** 空列表提示文案 */
  emptyText?: string;
}

export function TexturePicker({
  category,
  onSelect,
  disabled = false,
  label,
  emptyText,
}: TexturePickerProps) {
  const { locale } = useLocale();
  const resolvedEmptyText = emptyText ?? appMessages[locale].common.texturePickerEmpty;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const fetchPage = useCallback(
    (page: number) => fetchTexturesPage(page, category),
    [category]
  );

  const {
    items: textures,
    loading,
    loadingMore,
    hasMore,
    refresh,
    onListScroll,
  } = useInfiniteScrollList<TextureMeta>({
    fetchPage,
    resetKey: category,
  });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 280;
    const panelWidth = 240;
    const GAP = 4;

    let top = rect.bottom + GAP;
    let left = rect.left;

    if (top + panelHeight > window.innerHeight - 8) {
      top = rect.top - panelHeight - GAP;
    }
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8;
    }
    left = Math.max(8, left);
    top = Math.max(8, top);

    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (textures.length === 0) {
      void refresh();
    }
  }, [open, refresh, textures.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition, textures.length, loading]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();

    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePosition]);

  const handleSelect = (meta: TextureMeta) => {
    onSelect(meta);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1 text-left text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] disabled:opacity-40"
      >
        {label}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[9999] flex max-h-[280px] w-[240px] flex-col overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-lg"
            style={{ top: position.top, left: position.left }}
          >
            <div
              className="min-h-0 flex-1 overflow-y-auto p-1"
              onScroll={onListScroll}
            >
              {loading && textures.length === 0 ? (
                <div className="py-4 text-center text-xs text-[var(--text-muted)]">
                  {appMessages[locale].common.loading}
                </div>
              ) : textures.length === 0 ? (
                <div className="py-4 text-center text-xs text-[var(--text-muted)]">
                  {resolvedEmptyText}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {textures.map((tex) => {
                    const name = tex.name || '—';
                    const src = tex.thumbnail_url || tex.file_url;
                    return (
                      <button
                        key={tex.texture_id}
                        type="button"
                        onClick={() => handleSelect(tex)}
                        className="overflow-hidden rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] text-left hover:border-[var(--accent)]"
                      >
                        <div className="relative w-full" style={{ paddingTop: '100%' }}>
                          {src ? (
                            <img
                              src={src}
                              alt={name}
                              className="absolute inset-0 h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[var(--text-muted)]">
                              —
                            </div>
                          )}
                        </div>
                        <Tooltip content={name} triggerClassName="w-full min-w-0">
                          <div className="truncate px-1 py-0.5 text-[10px] text-[var(--text-primary)]">
                            {name}
                          </div>
                        </Tooltip>
                      </button>
                    );
                  })}
                </div>
              )}
              <ListScrollFooter loading={loading} loadingMore={loadingMore} hasMore={hasMore} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
