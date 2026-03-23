import { useMemo, useState } from 'react';

import { ColorPicker } from '../../../../components/ColorPicker';
import { ImagePreviewDialog } from '../../../../components/ImagePreviewDialog';
import { Select } from '../../../../components/Select';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';

export type SceneSettingsEnvironmentLabels = {
  title: string;

  backgroundModeLabel: string;
  backgroundModeOptions: {
    solid: string;
    skybox: string;
  };
  backgroundColorLabel: string;

  environmentHdriLabel: string;
  environmentHdriSelectPlaceholder: string;
  environmentHdriUploadLabel: string;

  environmentStrengthLabel: string;

  fogToggleLabel: string;
  fogColorLabel: string;
  fogNearLabel: string;
  fogFarLabel: string;

  environmentHdriPreviewTitle: string;
  environmentHdriPreviewLoading: string;
  environmentHdriPreviewError: string;
  environmentHdriPreviewUnsupported?: string;
};

export function SceneSettingsEnvironmentItem({
  env,
  cancelText
}: {
  env: SceneSettingsEnvironmentLabels;
  cancelText: string;
}) {
  const {
    sceneSettings,
    setBackgroundMode,
    setBackgroundColor,
    setHdri,
    setEnvironmentStrength,
    setFogEnabled,
    setFogColor,
    setFogNear,
    setFogFar
  } = useSceneSettings();

  const settings = sceneSettings.environment;
  const {
    backgroundMode,
    backgroundColor,
    environmentStrength,
    fog: { enabled: fogEnabled, color: fogColor, near: fogNear, far: fogFar },
    hdri
  } = settings;

  const hdrObjectUrl = hdri.type === 'uploaded' ? hdri.url : null;
  const hdrFileName = hdri.type === 'uploaded' ? hdri.fileName ?? null : null;
  const hdrMimeType = hdri.type === 'uploaded' ? hdri.mimeType ?? null : null;

  // 环境 HDRI：UI 预留“资源库选择”入口（当前仍为空）
  const [hdrSelectKey, setHdrSelectKey] = useState('');

  const [previewOpen, setPreviewOpen] = useState(false);

  const isPreviewableImage = useMemo(() => {
    if (hdri.type !== 'uploaded') return false;
    if (hdrMimeType?.startsWith('image/')) return true;

    // 兜底：如果没有 File/mime，只根据扩展名判断（包括但不限于 png/jpg/webp 等）
    const ext = (hdrFileName ?? '').split('.').pop()?.toLowerCase() ?? '';
    return Boolean(ext && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(ext));
  }, [hdri, hdrMimeType, hdrFileName]);

  return (
    <>
      <div className="space-y-3">
        {/* 背景模式 */}
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
            {env.backgroundModeLabel}
          </label>
          <Select
            value={backgroundMode}
            onChange={(v) => {
              const next = v as typeof backgroundMode;
              setBackgroundMode(next);
              // 切到纯色模式时，不允许继续预览/配置贴图
              if (next === 'solid') setPreviewOpen(false);
            }}
            options={[
              { value: 'solid', label: env.backgroundModeOptions.solid },
              { value: 'skybox', label: env.backgroundModeOptions.skybox }
            ]}
          />
        </div>

        {/* 背景颜色（纯色模式生效） */}
        {backgroundMode === 'solid' ? (
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
              {env.backgroundColorLabel}
            </label>
            <div className="flex items-center gap-3">
              <ColorPicker
                value={backgroundColor}
                onChange={setBackgroundColor}
                ariaLabel={env.backgroundColorLabel}
                showValue={true}
              />
            </div>
          </div>
        ) : null}

        {backgroundMode === 'skybox' ? (
          // 环境贴图 (texture) 仅在 skybox 模式下允许配置
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
              {env.environmentHdriLabel}
            </label>
            <div className="space-y-1.5">
              <Select
                value={hdrSelectKey}
                onChange={(v) => setHdrSelectKey(v)}
                options={[]}
                placeholder={env.environmentHdriSelectPlaceholder}
                ariaLabel={env.environmentHdriSelectPlaceholder}
              />

              <div className="flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-2 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <input
                    type="file"
                    accept=".hdr,.exr,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setPreviewOpen(false);
                      setHdri(
                        f
                          ? { type: 'uploaded', url: URL.createObjectURL(f), fileName: f.name, mimeType: f.type }
                          : { type: 'none' }
                      );
                    }}
                  />
                  {env.environmentHdriUploadLabel}
                </label>

                {isPreviewableImage && hdrObjectUrl ? (
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className={[
                      'min-w-0 flex-1 truncate text-left text-xs text-[var(--text-muted)]',
                      'hover:text-[var(--text-primary)] underline underline-offset-2'
                    ].join(' ')}
                  >
                    {hdrFileName ?? '-'}
                  </button>
                ) : (
                  <div className="min-w-0 flex-1 text-xs text-[var(--text-muted)] truncate">
                    {hdrFileName ?? '-'}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* 环境强度 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
              {env.environmentStrengthLabel}
            </label>
            <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
              {environmentStrength.toFixed(2)}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={5}
            step={0.01}
            value={environmentStrength}
            onChange={(e) => setEnvironmentStrength(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Fog */}
        <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-2">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
              {env.fogToggleLabel}
            </span>
            <input
              type="checkbox"
              checked={fogEnabled}
              onChange={(e) => setFogEnabled(e.target.checked)}
              className="h-4 w-4"
            />
          </label>

          {fogEnabled ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
                  {env.fogColorLabel}
                </label>
                <ColorPicker
                  value={fogColor}
                  onChange={setFogColor}
                  ariaLabel={env.fogColorLabel}
                  showValue={true}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
                  {env.fogNearLabel}
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.1}
                  value={fogNear}
                  onChange={(e) => setFogNear(Number(e.target.value))}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
                  {env.fogFarLabel}
                </label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={0.1}
                  value={fogFar}
                  onChange={(e) => setFogFar(Number(e.target.value))}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ImagePreviewDialog
        open={previewOpen}
        fileUrl={hdrObjectUrl}
        title={env.environmentHdriPreviewTitle}
        loadingText={env.environmentHdriPreviewLoading}
        errorText={env.environmentHdriPreviewError}
        unsupportedText={env.environmentHdriPreviewUnsupported}
        closeText={cancelText}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

