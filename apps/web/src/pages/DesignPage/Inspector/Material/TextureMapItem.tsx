/**
 * 贴图槽 UI 组件。
 *
 * 这个组件只关心单个槽位的交互与回显：
 * - 缩略图展示
 * - 上传 / 清除按钮
 * - 可选的强度控制
 *
 * 一个关键点是：预览图优先使用我们自己的会话缓存 URL，
 * 避免 three Texture 内部 `image.src` 已被 revoke 后出现 `ERR_FILE_NOT_FOUND`。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from '../../../../components/Tooltip';
import { useImagePreview } from '../../../../components/ImagePreviewContext';
import { getCachedTextureAssetPreviewUrl, getTextureAssetRef } from '../../../../utils/textureAssetSession';

/**
 * 贴图强度参数类型：
 * - none：无强度控制
 * - number：单数值（如 envMapIntensity / aoMapIntensity）
 * - vector2：二维向量（如 normalScale / clearcoatNormalScale）
 */
export type TextureMapItemIntensity =
  | { type: 'none' }
  | {
      type: 'number';
      label: string;
      value: number;
      min?: number;
      max?: number;
      step?: number;
      onPreviewChange: (v: number) => void;
      onCommit: (v: number) => void;
      onDragStart?: () => void;
    }
  | {
      type: 'vector2';
      labelX: string;
      labelY: string;
      value: { x: number; y: number };
      minX?: number;
      maxX?: number;
      stepX?: number;
      minY?: number;
      maxY?: number;
      stepY?: number;
      onPreviewChange: (v: { x: number; y: number }) => void;
      onCommit: (v: { x: number; y: number }) => void;
      onDragStart?: (axis: 'x' | 'y') => void;
    };

/** TextureMapItem 的通用操作文案 */
export type TextureMapItemLabels = {
  upload: string;
  clear: string;
  empty: string;
  textureFallback: string;
};

/** 单个贴图槽组件的 props */
export type TextureMapItemProps = {
  title: string;
  labels: TextureMapItemLabels;
  texture: any | null;
  accept?: string;
  intensity?: TextureMapItemIntensity;
  debugToggle?: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  };
  onUpload: (file: File) => void;
  onClear: () => void;
};

function tryGetPreviewUrl(texture: any | null): string | null {
  const assetRef = getTextureAssetRef(texture);
  if (assetRef) {
    // 先从会话缓存里拿稳定预览地址；它比 three 内部的 blob URL 生命周期更可控。
    const cachedPreviewUrl = getCachedTextureAssetPreviewUrl(assetRef.id);
    if (cachedPreviewUrl) return cachedPreviewUrl;
  }
  // 优先读取 three Texture.image 上可直接预览的地址
  const img = texture?.image;
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (typeof img?.src === 'string') return img.src;
  return null;
}

/**
 * 单个贴图槽组件：展示缩略图、支持上传/清除，并根据 intensity 类型可选展示强度控制滑杆。
 */
export function TextureMapItem({
  title,
  labels,
  texture,
  accept = 'image/*',
  intensity,
  debugToggle,
  onUpload,
  onClear,
}: TextureMapItemProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const prevTextureRef = useRef<any | null>(null);
  const { openPreview } = useImagePreview();

  // 本地预览优先级最高：用户刚上传时立即看到结果，等异步材质回写完成后再自然切回正式贴图引用。
  const previewUrl = useMemo(() => localPreviewUrl ?? tryGetPreviewUrl(texture), [localPreviewUrl, texture]);

  // 贴图引用变更时，需要清掉上一对象/上一材质槽位的本地 blob 预览，避免切模型后仍显示旧图。
  useEffect(() => {
    if (prevTextureRef.current === texture) return;
    prevTextureRef.current = texture;
    setLocalPreviewUrl((prev) => {
      if (!prev) return prev;
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
  }, [texture]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  return (
    <div className="space-y-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <Tooltip content={title} placement="top" triggerClassName="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{title}</div>
        </Tooltip>
        <div className="flex shrink-0 items-center gap-2">
          {debugToggle ? (
            <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold tracking-wide text-[var(--text-secondary)]">
              <span>{debugToggle.label}</span>
              <input
                type="checkbox"
                checked={debugToggle.checked}
                onChange={(e) => debugToggle.onChange(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {labels.upload}
          </button>
          <button
            type="button"
            onClick={() => {
              if (localPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
              setLocalPreviewUrl(null);
              onClear();
            }}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {labels.clear}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          // 本地预览先行，上传结果异步回写材质；这样 UI 不会等贴图加载完成才有反馈。
          const nextUrl = URL.createObjectURL(f);
          if (localPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
          setLocalPreviewUrl(nextUrl);
          onUpload(f);
          e.currentTarget.value = '';
        }}
      />

      <div className="flex items-center gap-3">
        {previewUrl ? (
          <div className="group relative h-10 w-10 shrink-0">
            <div className="h-10 w-10 overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)]">
              <img src={previewUrl} alt={title} className="h-full w-full object-cover" />
            </div>
            <button
              type="button"
              onClick={() => openPreview(previewUrl, title)}
              className="absolute inset-0 hidden items-center justify-center rounded-md bg-black/50 text-white group-hover:flex"
              aria-label="Preview"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-md border border-dashed border-[var(--border-subtle)] bg-[var(--bg-input)]" />
        )}
        <Tooltip
          content={texture ? texture.name || texture.uuid || labels.textureFallback : labels.empty}
          placement="top"
          triggerClassName="min-w-0 flex-1"
        >
          <div className="truncate text-[10px] text-[var(--text-secondary)]">
            {texture ? texture.name || texture.uuid || labels.textureFallback : labels.empty}
          </div>
        </Tooltip>
      </div>

      {intensity && intensity.type === 'number' ? (
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between gap-3">
            <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{intensity.label}</label>
            <div className="text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{intensity.value.toFixed(2)}</div>
          </div>
          <input
            type="range"
            min={intensity.min ?? 0}
            max={intensity.max ?? 1}
            step={intensity.step ?? 0.01}
            value={intensity.value}
            onPointerDown={() => intensity.onDragStart?.()}
            onChange={(e) => intensity.onPreviewChange(Number(e.target.value))}
            onPointerUp={(e) => intensity.onCommit(Number((e.target as HTMLInputElement).value))}
            className="w-full"
          />
        </div>
      ) : null}

      {intensity && intensity.type === 'vector2' ? (
        <div className="space-y-2 pt-1">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{intensity.labelX}</label>
              <div className="text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{intensity.value.x.toFixed(2)}</div>
            </div>
            <input
              type="range"
              min={intensity.minX ?? 0}
              max={intensity.maxX ?? 5}
              step={intensity.stepX ?? 0.01}
              value={intensity.value.x}
              onPointerDown={() => intensity.onDragStart?.('x')}
              onChange={(e) => intensity.onPreviewChange({ ...intensity.value, x: Number(e.target.value) })}
              onPointerUp={(e) => intensity.onCommit({ ...intensity.value, x: Number((e.target as HTMLInputElement).value) })}
              className="w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{intensity.labelY}</label>
              <div className="text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{intensity.value.y.toFixed(2)}</div>
            </div>
            <input
              type="range"
              min={intensity.minY ?? 0}
              max={intensity.maxY ?? 5}
              step={intensity.stepY ?? 0.01}
              value={intensity.value.y}
              onPointerDown={() => intensity.onDragStart?.('y')}
              onChange={(e) => intensity.onPreviewChange({ ...intensity.value, y: Number(e.target.value) })}
              onPointerUp={(e) => intensity.onCommit({ ...intensity.value, y: Number((e.target as HTMLInputElement).value) })}
              className="w-full"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
