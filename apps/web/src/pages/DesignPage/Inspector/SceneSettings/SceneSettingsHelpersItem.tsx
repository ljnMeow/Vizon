import { ColorPicker } from '../../../../components/ColorPicker';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { useEffect, useState } from 'react';

/** 坐标轴辅助显示的 i18n 文案 */
export type SceneSettingsHelpersLabels = {
  title: string;
  axisTitle: string;
  axisEnabledLabel: string;
  axisSizeLabel: string;
};

/** 网格辅助显示的 i18n 文案 */
export type SceneSettingsGridLabels = {
  title: string;
  enabledLabel: string;
  colorLabel: string;
  opacityLabel: string;
};

/**
 * 网格辅助线设置子组件（颜色 / 透明度）。
 * 仅在 enabled=true 时展开颜色和透明度控制，减少视觉干扰。
 */
function GridHelperSettings({ labels }: { labels: SceneSettingsGridLabels }) {
  const { sceneSettings, updateSceneSettings, setGridEnabled, setGridColor, setGridOpacity } = useSceneSettings();
  const { enabled, color, opacity } = sceneSettings.grid;
  const [draftOpacity, setDraftOpacity] = useState(opacity);
  useEffect(() => setDraftOpacity(opacity), [opacity]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.enabledLabel}</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setGridEnabled(e.target.checked)}
            className="h-4 w-4"
          />
        </label>
      </div>

      {enabled && (
        <>
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.colorLabel}</label>
            <ColorPicker
              value={color}
              onChange={(nextColor) => {
                setGridColor(nextColor);
              }}
              ariaLabel={labels.colorLabel}
              showValue={true}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
                {labels.opacityLabel}
              </label>
              <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{opacity.toFixed(2)}</div>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={draftOpacity}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                setDraftOpacity(v);
                updateSceneSettings(
                  (prev) => ({ ...prev, grid: { ...prev.grid, opacity: v } }),
                  { recordHistory: false }
                );
              }}
              onPointerUp={() => setGridOpacity(draftOpacity)}
              className="w-full"
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 辅助显示面板，包含网格和坐标轴两个子项。
 */
export function SceneSettingsHelpersItem({
  labels,
  gridLabels
}: {
  labels: SceneSettingsHelpersLabels;
  gridLabels: SceneSettingsGridLabels;
}) {
  const { sceneSettings, updateSceneSettings, setAxesEnabled, setAxesSize } = useSceneSettings();
  const { axes } = sceneSettings.helpers;
  const [draftAxesSize, setDraftAxesSize] = useState(axes.size);
  useEffect(() => setDraftAxesSize(axes.size), [axes.size]);

  return (
    <div className="space-y-4">
      {/* 表格/网格辅助 */}
      <div className="space-y-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-3">
        <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{gridLabels.title}</div>
        <GridHelperSettings labels={gridLabels} />
      </div>

      {/* 坐标轴辅助 */}
      <div className="space-y-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-3">
        <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.axisTitle}</div>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.axisEnabledLabel}</span>
          <input type="checkbox" checked={axes.enabled} onChange={(e) => setAxesEnabled(e.target.checked)} className="h-4 w-4" />
        </label>

        {axes.enabled && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.axisSizeLabel}</label>
              <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{axes.size.toFixed(2)}</div>
            </div>
            <input
              type="range"
              min={0.1}
              max={100}
              step={0.1}
              value={draftAxesSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                setDraftAxesSize(v);
                updateSceneSettings(
                  (prev) => ({
                    ...prev,
                    helpers: { ...prev.helpers, axes: { ...prev.helpers.axes, size: v } }
                  }),
                  { recordHistory: false }
                );
              }}
              onPointerUp={() => setAxesSize(draftAxesSize)}
              disabled={!axes.enabled}
              className="w-full disabled:opacity-50"
            />
          </div>
        )}
      </div>

    </div>
  );
}

