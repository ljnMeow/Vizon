import { createDefaultSceneSettings } from 'vizon-3d-core';
import { useEffect, useState } from 'react';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';

/** 相机设置项的 i18n 文案 */
export type SceneSettingsCameraLabels = {
  title: string;
  fovLabel: string;
  nearLabel: string;
  farLabel: string;
  positionLabel: string;
  targetLabel: string;
  resetCameraLabel: string;
};

/** 默认相机参数，用于检测是否有变更从而决定是否显示重置按钮 */
const DEFAULT_CAMERA_SETTINGS = createDefaultSceneSettings().camera;

function almostEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function AxisInput({
  label,
  value,
  onPreviewChange,
  onCommit
}: {
  label: string;
  value: number;
  onPreviewChange: (next: number) => void;
  onCommit: (next: number) => void;
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
          onPreviewChange(next);
        }}
        onBlur={(e) => {
          const next = Number((e.target as HTMLInputElement).value);
          if (!Number.isFinite(next)) return;
          onCommit(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        }}
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      />
    </div>
  );
}

/**
 * 相机参数设置项（FOV / near / far / 位置 / 目标点）。
 * FOV 使用 range 拖动实时更新，失去焦点或松手时提交历史。
 */
export function SceneSettingsCameraItem({ labels }: { labels: SceneSettingsCameraLabels }) {
  const {
    cameraSettings,
    setCameraFov,
    resetCamera,
    updateSceneSettings
  } = useSceneSettings();

  const { fov, near, far, position, target } = cameraSettings;
  const [draftFov, setDraftFov] = useState(fov);
  const [draftNear, setDraftNear] = useState(near);
  const [draftFar, setDraftFar] = useState(far);
  const [draftPos, setDraftPos] = useState(position);
  const [draftTarget, setDraftTarget] = useState(target);

  useEffect(() => setDraftFov(fov), [fov]);
  useEffect(() => setDraftNear(near), [near]);
  useEffect(() => setDraftFar(far), [far]);
  useEffect(() => setDraftPos(position), [position]);
  useEffect(() => setDraftTarget(target), [target]);
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
          value={draftFov}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            setDraftFov(v);
            updateSceneSettings(
              (prev) => ({ ...prev, camera: { ...prev.camera, fov: v } }),
              { recordHistory: false }
            );
          }}
          onPointerUp={() => setCameraFov(draftFov)}
          onMouseUp={() => setCameraFov(draftFov)}
          onTouchEnd={() => setCameraFov(draftFov)}
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
            value={draftNear}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              setDraftNear(v);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, near: v } }),
                { recordHistory: false }
              );
            }}
            onBlur={() => {
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, near: draftNear } }),
                { recordHistory: true, operationName: `修改场景属性-相机-近平面 = ${Number(draftNear.toFixed(4))}` }
              );
            }}
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
            value={draftFar}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              setDraftFar(v);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, far: v } }),
                { recordHistory: false }
              );
            }}
            onBlur={() => {
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, far: draftFar } }),
                { recordHistory: true, operationName: `修改场景属性-相机-远平面 = ${Number(draftFar.toFixed(4))}` }
              );
            }}
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          />
        </div>
      </div>

      {/* Camera Position */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.positionLabel}</div>
        <div className="grid grid-cols-3 gap-2">
          <AxisInput
            label="X"
            value={draftPos.x}
            onPreviewChange={(x) => {
              const next = { ...draftPos, x };
              setDraftPos(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, position: next } }),
                  { recordHistory: false }
              );
            }}
            onCommit={(x) => {
              const next = { ...draftPos, x };
              setDraftPos(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, position: next } }),
                  { recordHistory: true, operationName: `修改场景属性-相机-位置 = (${Number(next.x.toFixed(4))}, ${Number(next.y.toFixed(4))}, ${Number(next.z.toFixed(4))})` }
              );
            }}
          />
          <AxisInput
            label="Y"
            value={draftPos.y}
            onPreviewChange={(y) => {
              const next = { ...draftPos, y };
              setDraftPos(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, position: next } }),
                  { recordHistory: false }
              );
            }}
            onCommit={(y) => {
              const next = { ...draftPos, y };
              setDraftPos(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, position: next } }),
                  { recordHistory: true, operationName: `修改场景属性-相机-位置 = (${Number(next.x.toFixed(4))}, ${Number(next.y.toFixed(4))}, ${Number(next.z.toFixed(4))})` }
              );
            }}
          />
          <AxisInput
            label="Z"
            value={draftPos.z}
            onPreviewChange={(z) => {
              const next = { ...draftPos, z };
              setDraftPos(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, position: next } }),
                  { recordHistory: false }
              );
            }}
            onCommit={(z) => {
              const next = { ...draftPos, z };
              setDraftPos(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, position: next } }),
                  { recordHistory: true, operationName: `修改场景属性-相机-位置 = (${Number(next.x.toFixed(4))}, ${Number(next.y.toFixed(4))}, ${Number(next.z.toFixed(4))})` }
              );
            }}
          />
        </div>
      </div>

      {/* Target */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.targetLabel}</div>
        <div className="grid grid-cols-3 gap-2">
          <AxisInput
            label="X"
            value={draftTarget.x}
            onPreviewChange={(x) => {
              const next = { ...draftTarget, x };
              setDraftTarget(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, target: next } }),
                  { recordHistory: false }
              );
            }}
            onCommit={(x) => {
              const next = { ...draftTarget, x };
              setDraftTarget(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, target: next } }),
                  { recordHistory: true, operationName: `修改场景属性-相机-目标 = (${Number(next.x.toFixed(4))}, ${Number(next.y.toFixed(4))}, ${Number(next.z.toFixed(4))})` }
              );
            }}
          />
          <AxisInput
            label="Y"
            value={draftTarget.y}
            onPreviewChange={(y) => {
              const next = { ...draftTarget, y };
              setDraftTarget(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, target: next } }),
                  { recordHistory: false }
              );
            }}
            onCommit={(y) => {
              const next = { ...draftTarget, y };
              setDraftTarget(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, target: next } }),
                  { recordHistory: true, operationName: `修改场景属性-相机-目标 = (${Number(next.x.toFixed(4))}, ${Number(next.y.toFixed(4))}, ${Number(next.z.toFixed(4))})` }
              );
            }}
          />
          <AxisInput
            label="Z"
            value={draftTarget.z}
            onPreviewChange={(z) => {
              const next = { ...draftTarget, z };
              setDraftTarget(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, target: next } }),
                  { recordHistory: false }
              );
            }}
            onCommit={(z) => {
              const next = { ...draftTarget, z };
              setDraftTarget(next);
              updateSceneSettings(
                (prev) => ({ ...prev, camera: { ...prev.camera, target: next } }),
                  { recordHistory: true, operationName: `修改场景属性-相机-目标 = (${Number(next.x.toFixed(4))}, ${Number(next.y.toFixed(4))}, ${Number(next.z.toFixed(4))})` }
              );
            }}
          />
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

