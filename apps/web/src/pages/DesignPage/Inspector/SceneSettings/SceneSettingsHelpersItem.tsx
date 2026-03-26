import { ColorPicker } from '../../../../components/ColorPicker';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';

export type SceneSettingsHelpersLabels = {
  title: string;
  axisTitle: string;
  axisEnabledLabel: string;
  axisSizeLabel: string;
};

export type SceneSettingsGridLabels = {
  title: string;
  enabledLabel: string;
  colorLabel: string;
  opacityLabel: string;
};

function GridHelperSettings({ labels }: { labels: SceneSettingsGridLabels }) {
  const { sceneSettings, setGridEnabled, setGridColor, setGridOpacity } = useSceneSettings();
  const { enabled, color, opacity } = sceneSettings.grid;

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
              value={opacity}
              onChange={(e) => setGridOpacity(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </>
      )}
    </div>
  );
}

export function SceneSettingsHelpersItem({
  labels,
  gridLabels
}: {
  labels: SceneSettingsHelpersLabels;
  gridLabels: SceneSettingsGridLabels;
}) {
  const { sceneSettings, setAxesEnabled, setAxesSize } = useSceneSettings();
  const { axes } = sceneSettings.helpers;

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
              value={axes.size}
              onChange={(e) => setAxesSize(Number(e.target.value))}
              disabled={!axes.enabled}
              className="w-full disabled:opacity-50"
            />
          </div>
        )}
      </div>

    </div>
  );
}

