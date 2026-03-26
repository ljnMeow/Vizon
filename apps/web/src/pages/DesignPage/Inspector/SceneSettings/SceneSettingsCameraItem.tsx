import { createDefaultSceneSettings } from 'vizon-3d-core';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';

export type SceneSettingsCameraLabels = {
  title: string;
  fovLabel: string;
  nearLabel: string;
  farLabel: string;
  positionLabel: string;
  targetLabel: string;
  resetCameraLabel: string;
};

const DEFAULT_CAMERA_SETTINGS = createDefaultSceneSettings().camera;

function almostEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function AxisInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isFinite(next)) return;
          onChange(next);
        }}
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      />
    </div>
  );
}

export function SceneSettingsCameraItem({ labels }: { labels: SceneSettingsCameraLabels }) {
  const {
    cameraSettings,
    setCameraFov,
    setCameraNear,
    setCameraFar,
    setCameraPosition,
    setCameraTarget,
    resetCamera
  } = useSceneSettings();

  const { fov, near, far, position, target } = cameraSettings;
  const canResetCamera =
    !almostEqual(fov, DEFAULT_CAMERA_SETTINGS.fov) ||
    !almostEqual(near, DEFAULT_CAMERA_SETTINGS.near) ||
    !almostEqual(far, DEFAULT_CAMERA_SETTINGS.far) ||
    !almostEqual(position.x, DEFAULT_CAMERA_SETTINGS.position.x) ||
    !almostEqual(position.y, DEFAULT_CAMERA_SETTINGS.position.y) ||
    !almostEqual(position.z, DEFAULT_CAMERA_SETTINGS.position.z) ||
    !almostEqual(target.x, DEFAULT_CAMERA_SETTINGS.target.x) ||
    !almostEqual(target.y, DEFAULT_CAMERA_SETTINGS.target.y) ||
    !almostEqual(target.z, DEFAULT_CAMERA_SETTINGS.target.z);

  return (
    <div className="space-y-3">
      {/* FOV */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
            {labels.fovLabel}
          </label>
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">{fov.toFixed(1)}</div>
        </div>
        <input
          type="range"
          min={10}
          max={120}
          step={0.1}
          value={fov}
          onChange={(e) => setCameraFov(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Near / Far */}
      <div className="space-y-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 p-2">
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
            {labels.nearLabel}
          </label>
          <input
            type="number"
            min={0.001}
            max={100}
            step={0.001}
            value={near}
            onChange={(e) => setCameraNear(Number(e.target.value))}
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
            {labels.farLabel}
          </label>
          <input
            type="number"
            min={1}
            max={100000}
            step={1}
            value={far}
            onChange={(e) => setCameraFar(Number(e.target.value))}
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
        </div>
      </div>

      {/* Camera Position */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.positionLabel}</div>
        <div className="grid grid-cols-3 gap-2">
          <AxisInput label="X" value={position.x} onChange={(x) => setCameraPosition({ ...position, x })} />
          <AxisInput label="Y" value={position.y} onChange={(y) => setCameraPosition({ ...position, y })} />
          <AxisInput label="Z" value={position.z} onChange={(z) => setCameraPosition({ ...position, z })} />
        </div>
      </div>

      {/* Target */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.targetLabel}</div>
        <div className="grid grid-cols-3 gap-2">
          <AxisInput label="X" value={target.x} onChange={(x) => setCameraTarget({ ...target, x })} />
          <AxisInput label="Y" value={target.y} onChange={(y) => setCameraTarget({ ...target, y })} />
          <AxisInput label="Z" value={target.z} onChange={(z) => setCameraTarget({ ...target, z })} />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={resetCamera}
          disabled={!canResetCamera}
          aria-disabled={!canResetCamera}
          aria-label={labels.resetCameraLabel}
          className={[
            'inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
            canResetCamera
              ? 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
              : 'cursor-not-allowed border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 text-[var(--text-muted)] opacity-60'
          ].join(' ')}
        >
          {labels.resetCameraLabel}
        </button>
      </div>
    </div>
  );
}

