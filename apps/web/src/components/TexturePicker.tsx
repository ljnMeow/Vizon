/**
 * 贴图资源选择器：弹出下拉面板，展示指定分类的贴图资源供选择。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { type TextureCategory, type TextureMeta, listTextures } from '../api/textures';
import { useLocale } from '../hooks/useLocale';
import { appMessages } from '../i18n/messages';
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
  const [textures, setTextures] = useState<TextureMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 280;
    const panelWidth = 240;
    const GAP = 4;

    let top = rect.bottom + GAP;
    let left = rect.left;

    // 如果下方空间不足，放到上方
    if (top + panelHeight > window.innerHeight - 8) {
      top = rect.top - panelHeight - GAP;
    }
    // 右侧溢出
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8;
    }
    left = Math.max(8, left);
    top = Math.max(8, top);

    setPosition({ top, left });
  }, []);

  // 打开时加载列表 + 定位
  useEffect(() => {
    if (!open) return;

    setLoading(true);
    let cancelled = false;
    void listTextures(category).then((data) => {
      if (cancelled) return;
      setTextures(data);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setTextures([]);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [open, category]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition, textures]);

  // 点击外部关闭
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
        className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {label}
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={panelRef}
          className="fixed z-[999999] w-60 max-h-72 overflow-y-auto rounded-md border border-[var(--border-subtle)] shadow-[0_8px_24px_rgba(0,0,0,0.25)] backdrop-blur-sm"
          style={{
            top: position.top,
            left: position.left,
            backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 95%, var(--text-primary) 5%)',
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-6 text-[10px] text-[var(--text-muted)]">
              Loading...
            </div>
          ) : textures.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-[10px] text-[var(--text-muted)]">
              {resolvedEmptyText}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 p-1.5">
              {textures.map((tex) => {
                const name = tex.name || 'Untitled';
                return (
                  <button
                    key={tex.texture_id}
                    type="button"
                    onClick={() => handleSelect(tex)}
                    className="rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] overflow-hidden text-left hover:border-[var(--accent)] transition-colors"
                  >
                    <div className="relative w-full" style={{ paddingTop: '100%' }}>
                      {tex.thumbnail_url ? (
                        <img
                          src={tex.thumbnail_url}
                          alt={name}
                          className="absolute inset-0 h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)] text-[8px]">
                          N/A
                        </div>
                      )}
                    </div>
                    <Tooltip content={name} triggerClassName="w-full min-w-0">
                      <div className="truncate px-1 py-0.5 text-[9px] text-[var(--text-secondary)]">
                        {name}
                      </div>
                    </Tooltip>
                  </button>
                );
              })}
            </div>
          )}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
