import { useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from '../../../../components/Tooltip';

export type TextureMapItemIntensity =
  | { type: 'none' }
  | { type: 'number'; label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }
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
      onChange: (v: { x: number; y: number }) => void;
    };

export type TextureMapItemLabels = {
  upload: string;
  clear: string;
  empty: string;
  textureFallback: string;
};

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
  // 优先读取 three Texture.image 上可直接预览的地址
  const img = texture?.image;
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (typeof img?.src === 'string') return img.src;
  return null;
}

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

  const previewUrl = useMemo(() => localPreviewUrl ?? tryGetPreviewUrl(texture), [localPreviewUrl, texture]);

  // 父级清除贴图后 texture 变为 null，需同步清掉本地上传的 blob 预览，避免仍显示旧缩略图
  useEffect(() => {
    if (texture) return;
    setLocalPreviewUrl((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
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
          // 本地预览先行，上传结果异步回写材质
          const nextUrl = URL.createObjectURL(f);
          if (localPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
          setLocalPreviewUrl(nextUrl);
          onUpload(f);
          e.currentTarget.value = '';
        }}
      />

      <div className="flex items-center gap-3">
        {previewUrl ? (
          <div className="h-10 w-10 overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={title} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-10 w-10 rounded-md border border-dashed border-[var(--border-subtle)] bg-[var(--bg-input)]" />
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
            onChange={(e) => intensity.onChange(Number(e.target.value))}
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
              onChange={(e) => intensity.onChange({ ...intensity.value, x: Number(e.target.value) })}
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
              onChange={(e) => intensity.onChange({ ...intensity.value, y: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
