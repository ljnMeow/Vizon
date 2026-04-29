import type { AppMessages } from '../../../../i18n/messages';
import { ColorPicker } from '../../../../components/ColorPicker';
import { useEffect, useState } from 'react';

/** 属性设置面板使用的 i18n 文案类型 */
type PropertiesLabels = AppMessages['designPage']['inspector']['propertiesSettings'];

/** 三维坐标轴 key */
type AxisKey = 'x' | 'y' | 'z';

/** 通用三维向量结构 */
type Vec3 = {
  x: number;
  y: number;
  z: number;
};

/** 当前选中对象的位移 / 旋转 / 缩放状态 */
type TransformState = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

/** 阴影与裁剪相关状态 */
type ShadowState = {
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  canCastShadow: boolean;
  canReceiveShadow: boolean;
  canFrustumCulled: boolean;
};

/** 可见性、可拾取性与冻结状态 */
type VisibilityPickFreezeState = {
  visible: boolean;
  pickable: boolean;
  frozen: boolean;
  canPickable: boolean;
  canFreeze: boolean;
};

/** 透明度编辑状态 */
type OpacityState = {
  opacity: number;
  canOpacity: boolean;
};

/** 渲染顺序编辑状态 */
type RenderOrderState = {
  renderOrder: number;
  canRenderOrder: boolean;
};

type LightColorState = {
  color: string;
  canColor: boolean;
};

type LightIntensityState = {
  intensity: number;
  canIntensity: boolean;
};

type DirectionalLightShadowState = {
  intensity: number;
  bias: number;
  normalBias: number;
  radius: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  helperVisible: boolean;
  canEdit: boolean;
};

/** 当前选中对象的基础信息 */
type SelectedObjectInfo = {
  uuid: string;
  type: string;
  name: string;
} | null;

/**
 * 单轴数值输入框。
 * 用于 position / rotation / scale 等三轴属性的重复 UI 复用。
 */
function AxisNumberInput({
  label,
  value,
  disabled,
  step,
  onPreviewChange,
  onCommit
}: {
  label: string;
  value: number;
  disabled: boolean;
  step?: number;
  onPreviewChange: (next: number) => void;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitDraft = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    onCommit(next);
    setDraft(String(next));
  };

  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{label}</label>
      <input
        type="number"
        value={draft}
        disabled={disabled}
        step={step ?? 0.01}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const next = Number(raw);
          if (!Number.isFinite(next)) return;
          onPreviewChange(next);
        }}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors disabled:opacity-60 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      />
    </div>
  );
}

function LabeledNumberInput({
  label,
  value,
  disabled,
  step,
  min,
  max,
  onPreviewChange,
  onCommit
}: {
  label: string;
  value: number;
  disabled: boolean;
  step?: number;
  min?: number;
  max?: number;
  onPreviewChange: (next: number) => void;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitDraft = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    onCommit(next);
    setDraft(String(next));
  };

  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{label}</label>
      <input
        type="number"
        value={draft}
        disabled={disabled}
        step={step ?? 0.01}
        min={min}
        max={max}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const next = Number(raw);
          if (!Number.isFinite(next)) return;
          onPreviewChange(next);
        }}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors disabled:opacity-60 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      />
    </div>
  );
}

/**
 * 基础属性设置面板：类型、uuid、名称、变换、可见性、阴影、透明度等通用属性。
 */
export function BaseSetting({
  labels,
  selectedInfo,
  transform,
  shadow,
  visibilityPickFreeze,
  opacityState,
  renderOrderState,
  lightColorState,
  lightIntensityState,
  directionalLightShadowState,
  onNamePreviewChange,
  onNameCommit,
  copyUuid,
  previewPositionAxis,
  commitPositionAxis,
  previewRotationAxis,
  commitRotationAxis,
  previewScaleAxis,
  commitScaleAxis,
  setVisible,
  setPickable,
  setFrozen,
  previewOpacity,
  commitOpacity,
  previewRenderOrder,
  commitRenderOrder,
  setCastShadow,
  setReceiveShadow,
  setFrustumCulled,
  previewLightColor,
  commitLightColor,
  previewLightIntensity,
  commitLightIntensity,
  previewDirectionalShadowNumber,
  commitDirectionalShadowNumber,
  setDirectionalShadowHelperVisible
}: {
  labels: PropertiesLabels;
  selectedInfo: SelectedObjectInfo;
  transform: TransformState | null;
  shadow: ShadowState | null;
  visibilityPickFreeze: VisibilityPickFreezeState | null;
  opacityState: OpacityState | null;
  renderOrderState: RenderOrderState | null;
  lightColorState: LightColorState | null;
  lightIntensityState: LightIntensityState | null;
  directionalLightShadowState: DirectionalLightShadowState | null;
  onNamePreviewChange: (nextName: string) => void;
  onNameCommit: (nextName: string) => void;
  copyUuid: () => void | Promise<void>;
  previewPositionAxis: (axis: AxisKey, next: number) => void;
  commitPositionAxis: (axis: AxisKey, next: number) => void;
  previewRotationAxis: (axis: AxisKey, next: number) => void;
  commitRotationAxis: (axis: AxisKey, next: number) => void;
  previewScaleAxis: (axis: AxisKey, next: number) => void;
  commitScaleAxis: (axis: AxisKey, next: number) => void;
  setVisible: (nextVisible: boolean) => void;
  setPickable: (nextPickable: boolean) => void;
  setFrozen: (nextFrozen: boolean) => void;
  previewOpacity: (nextOpacity: number) => void;
  commitOpacity: (nextOpacity: number) => void;
  previewRenderOrder: (nextRenderOrder: number) => void;
  commitRenderOrder: (nextRenderOrder: number) => void;
  setCastShadow: (nextCastShadow: boolean) => void;
  setReceiveShadow: (nextReceiveShadow: boolean) => void;
  setFrustumCulled: (nextFrustumCulled: boolean) => void;
  previewLightColor: (nextColor: string) => void;
  commitLightColor: (nextColor: string) => void;
  previewLightIntensity: (nextIntensity: number) => void;
  commitLightIntensity: (nextIntensity: number) => void;
  previewDirectionalShadowNumber: (
    path:
      | 'shadow.intensity'
      | 'shadow.bias'
      | 'shadow.normalBias'
      | 'shadow.radius'
      | 'shadow.camera.left'
      | 'shadow.camera.right'
      | 'shadow.camera.top'
      | 'shadow.camera.bottom'
      | 'shadow.camera.near'
      | 'shadow.camera.far',
    nextValue: number
  ) => void;
  commitDirectionalShadowNumber: (
    path:
      | 'shadow.intensity'
      | 'shadow.bias'
      | 'shadow.normalBias'
      | 'shadow.radius'
      | 'shadow.camera.left'
      | 'shadow.camera.right'
      | 'shadow.camera.top'
      | 'shadow.camera.bottom'
      | 'shadow.camera.near'
      | 'shadow.camera.far',
    nextValue: number
  ) => void;
  setDirectionalShadowHelperVisible: (nextVisible: boolean) => void;
}) {
  const isDisabled = !selectedInfo;
  const canShowShadow =
    Boolean(shadow?.canCastShadow) || Boolean(shadow?.canReceiveShadow) || Boolean(shadow?.canFrustumCulled);
  const canShowPickable = Boolean(visibilityPickFreeze?.canPickable);
  const canShowFreeze = Boolean(visibilityPickFreeze?.canFreeze);
  const canShowOpacity = Boolean(opacityState?.canOpacity);
  const canShowLightColor = Boolean(lightColorState?.canColor);
  const canShowLightIntensity = Boolean(lightIntensityState?.canIntensity);
  const canShowDirectionalLightShadow = Boolean(shadow?.castShadow) && Boolean(directionalLightShadowState?.canEdit);
  const isLightObject = Boolean(selectedInfo?.type?.endsWith('Light'));
  const lightColorLabel = ((labels as any).colorLabel as string | undefined) ?? 'Color';
  const shadowCameraRangeTitleLabel = ((labels as any).shadowCameraRangeTitleLabel as string | undefined) ?? 'Shadow Camera Range';
  const shadowCameraLeftLabel = ((labels as any).shadowCameraLeftLabel as string | undefined) ?? 'Left';
  const shadowCameraRightLabel = ((labels as any).shadowCameraRightLabel as string | undefined) ?? 'Right';
  const shadowCameraTopLabel = ((labels as any).shadowCameraTopLabel as string | undefined) ?? 'Top';
  const shadowCameraBottomLabel = ((labels as any).shadowCameraBottomLabel as string | undefined) ?? 'Bottom';
  const shadowCameraNearLabel = ((labels as any).shadowCameraNearLabel as string | undefined) ?? 'Near';
  const shadowCameraFarLabel = ((labels as any).shadowCameraFarLabel as string | undefined) ?? 'Far';
  const shadowHelperVisibleLabel = ((labels as any).shadowHelperVisibleLabel as string | undefined) ?? 'Show Shadow Frustum Helper';

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.typeLabel}</label>
        <input
          value={selectedInfo?.type ?? ''}
          disabled
          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors disabled:opacity-60"
          placeholder={labels.typeLabel}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.uuidLabel}</label>
        <div className="flex gap-2 items-center">
          <input
            value={selectedInfo?.uuid ?? ''}
            disabled
            className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors disabled:opacity-60"
            placeholder={labels.uuidLabel}
          />
          <button
            type="button"
            onClick={() => void copyUuid()}
            disabled={!selectedInfo}
            className={[
              'shrink-0 rounded-md border px-2 py-1.5 text-sm outline-none transition-colors',
              'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
              'hover:border-[var(--accent)] hover:ring-2 hover:ring-[var(--accent-soft)]',
              'disabled:opacity-60 disabled:hover:border-[var(--border-subtle)]'
            ].join(' ')}
          >
            {labels.copyLabel}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.nameLabel}</label>
        <input
          value={selectedInfo?.name ?? ''}
          onChange={(e) => onNamePreviewChange(e.target.value)}
          onBlur={(e) => onNameCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          placeholder={labels.namePlaceholder}
          disabled={isDisabled}
        />
      </div>

      {/* Position */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.positionLabel}</div>
        <div className="grid grid-cols-3 gap-2">
          <AxisNumberInput
            label={labels.xLabel}
            value={transform?.position.x ?? 0}
            disabled={isDisabled}
            onPreviewChange={(v) => previewPositionAxis('x', v)}
            onCommit={(v) => commitPositionAxis('x', v)}
          />
          <AxisNumberInput
            label={labels.yLabel}
            value={transform?.position.y ?? 0}
            disabled={isDisabled}
            onPreviewChange={(v) => previewPositionAxis('y', v)}
            onCommit={(v) => commitPositionAxis('y', v)}
          />
          <AxisNumberInput
            label={labels.zLabel}
            value={transform?.position.z ?? 0}
            disabled={isDisabled}
            onPreviewChange={(v) => previewPositionAxis('z', v)}
            onCommit={(v) => commitPositionAxis('z', v)}
          />
        </div>
      </div>

      {/* Rotation */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.rotationLabel}</div>
        <div className="grid grid-cols-3 gap-2">
          <AxisNumberInput
            label={labels.xLabel}
            value={transform?.rotation.x ?? 0}
            disabled={isDisabled}
            onPreviewChange={(v) => previewRotationAxis('x', v)}
            onCommit={(v) => commitRotationAxis('x', v)}
          />
          <AxisNumberInput
            label={labels.yLabel}
            value={transform?.rotation.y ?? 0}
            disabled={isDisabled}
            onPreviewChange={(v) => previewRotationAxis('y', v)}
            onCommit={(v) => commitRotationAxis('y', v)}
          />
          <AxisNumberInput
            label={labels.zLabel}
            value={transform?.rotation.z ?? 0}
            disabled={isDisabled}
            onPreviewChange={(v) => previewRotationAxis('z', v)}
            onCommit={(v) => commitRotationAxis('z', v)}
          />
        </div>
      </div>

      {/* Scale */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.scaleLabel}</div>
        <div className="grid grid-cols-3 gap-2">
          <AxisNumberInput
            label={labels.xLabel}
            value={transform?.scale.x ?? 1}
            disabled={isDisabled}
            step={0.01}
            onPreviewChange={(v) => previewScaleAxis('x', v)}
            onCommit={(v) => commitScaleAxis('x', v)}
          />
          <AxisNumberInput
            label={labels.yLabel}
            value={transform?.scale.y ?? 1}
            disabled={isDisabled}
            step={0.01}
            onPreviewChange={(v) => previewScaleAxis('y', v)}
            onCommit={(v) => commitScaleAxis('y', v)}
          />
          <AxisNumberInput
            label={labels.zLabel}
            value={transform?.scale.z ?? 1}
            disabled={isDisabled}
            step={0.01}
            onPreviewChange={(v) => previewScaleAxis('z', v)}
            onCommit={(v) => commitScaleAxis('z', v)}
          />
        </div>
      </div>

      {canShowLightColor ? (
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{lightColorLabel}</label>
          <ColorPicker
            value={lightColorState?.color ?? '#ffffff'}
            onChange={previewLightColor}
            onCommit={commitLightColor}
            disabled={isDisabled}
            ariaLabel={lightColorLabel}
            showValue={true}
          />
        </div>
      ) : null}

      {canShowLightIntensity ? (
        <LabeledNumberInput
          label={labels.lightIntensityLabel}
          value={lightIntensityState?.intensity ?? 1}
          disabled={isDisabled}
          step={0.1}
          onPreviewChange={previewLightIntensity}
          onCommit={commitLightIntensity}
        />
      ) : null}

      {/* Shadow */}
      {canShowShadow ? (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.shadowTitleLabel}</div>

          {/* 产生 / 接受：独占两行（框内） */}
          {shadow?.canCastShadow || shadow?.canReceiveShadow ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              {shadow?.canCastShadow ? (
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.castShadowLabel}</span>
                  <input
                    type="checkbox"
                    checked={shadow?.castShadow ?? false}
                    disabled={isDisabled}
                    onChange={(e) => setCastShadow(e.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
              ) : null}
              {shadow?.canReceiveShadow && !isLightObject ? (
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.receiveShadowLabel}</span>
                  <input
                    type="checkbox"
                    checked={shadow?.receiveShadow ?? false}
                    disabled={isDisabled}
                    onChange={(e) => setReceiveShadow(e.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {canShowDirectionalLightShadow ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.shadowIntensityLabel}
                  value={directionalLightShadowState?.intensity ?? 1}
                  disabled={isDisabled}
                  step={0.05}
                  min={0}
                  max={1}
                  onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.intensity', v)}
                  onCommit={(v) => commitDirectionalShadowNumber('shadow.intensity', v)}
                />
                <LabeledNumberInput
                  label={labels.shadowRadiusLabel}
                  value={directionalLightShadowState?.radius ?? 1}
                  disabled={isDisabled}
                  step={0.1}
                  min={0}
                  onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.radius', v)}
                  onCommit={(v) => commitDirectionalShadowNumber('shadow.radius', v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.shadowBiasLabel}
                  value={directionalLightShadowState?.bias ?? 0}
                  disabled={isDisabled}
                  step={0.0001}
                  onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.bias', v)}
                  onCommit={(v) => commitDirectionalShadowNumber('shadow.bias', v)}
                />
                <LabeledNumberInput
                  label={labels.shadowNormalBiasLabel}
                  value={directionalLightShadowState?.normalBias ?? 0}
                  disabled={isDisabled}
                  step={0.001}
                  min={0}
                  onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.normalBias', v)}
                  onCommit={(v) => commitDirectionalShadowNumber('shadow.normalBias', v)}
                />
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-2">
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                    {shadowHelperVisibleLabel}
                  </span>
                  <input
                    type="checkbox"
                    checked={directionalLightShadowState?.helperVisible ?? true}
                    disabled={isDisabled}
                    onChange={(e) => setDirectionalShadowHelperVisible(e.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-2">
                <div className="mb-2 text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                  {shadowCameraRangeTitleLabel}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledNumberInput
                    label={shadowCameraLeftLabel}
                    value={directionalLightShadowState?.left ?? -5}
                    disabled={isDisabled}
                    step={0.1}
                    onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.camera.left', v)}
                    onCommit={(v) => commitDirectionalShadowNumber('shadow.camera.left', v)}
                  />
                  <LabeledNumberInput
                    label={shadowCameraRightLabel}
                    value={directionalLightShadowState?.right ?? 5}
                    disabled={isDisabled}
                    step={0.1}
                    onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.camera.right', v)}
                    onCommit={(v) => commitDirectionalShadowNumber('shadow.camera.right', v)}
                  />
                  <LabeledNumberInput
                    label={shadowCameraTopLabel}
                    value={directionalLightShadowState?.top ?? 5}
                    disabled={isDisabled}
                    step={0.1}
                    onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.camera.top', v)}
                    onCommit={(v) => commitDirectionalShadowNumber('shadow.camera.top', v)}
                  />
                  <LabeledNumberInput
                    label={shadowCameraBottomLabel}
                    value={directionalLightShadowState?.bottom ?? -5}
                    disabled={isDisabled}
                    step={0.1}
                    onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.camera.bottom', v)}
                    onCommit={(v) => commitDirectionalShadowNumber('shadow.camera.bottom', v)}
                  />
                  <LabeledNumberInput
                    label={shadowCameraNearLabel}
                    value={directionalLightShadowState?.near ?? 0.5}
                    disabled={isDisabled}
                    step={0.1}
                    onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.camera.near', v)}
                    onCommit={(v) => commitDirectionalShadowNumber('shadow.camera.near', v)}
                  />
                  <LabeledNumberInput
                    label={shadowCameraFarLabel}
                    value={directionalLightShadowState?.far ?? 500}
                    disabled={isDisabled}
                    step={0.1}
                    onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.camera.far', v)}
                    onCommit={(v) => commitDirectionalShadowNumber('shadow.camera.far', v)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {shadow?.canFrustumCulled ? (
            <div className="space-y-1 pt-1">
              <div className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.frustumCulledLabel}</div>
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                    {labels.yesLabel}/{labels.noLabel}
                  </span>
                  <input
                    type="checkbox"
                    checked={shadow?.frustumCulled ?? false}
                    disabled={isDisabled}
                    onChange={(e) => setFrustumCulled(e.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Visibility / Pickable / Freeze */}
      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center justify-between gap-2">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.visibleLabel}</span>
            <input
              type="checkbox"
              checked={visibilityPickFreeze?.visible ?? false}
              disabled={isDisabled}
              onChange={(e) => setVisible(e.target.checked)}
              className="h-4 w-4"
            />
          </label>

          {canShowPickable ? (
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.pickableLabel}</span>
              <input
                type="checkbox"
                checked={visibilityPickFreeze?.pickable ?? false}
                disabled={isDisabled}
                onChange={(e) => setPickable(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
          ) : null}

          {canShowFreeze ? (
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.freezeLabel}</span>
              <input
                type="checkbox"
                checked={visibilityPickFreeze?.frozen ?? false}
                disabled={isDisabled}
                onChange={(e) => setFrozen(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
          ) : null}
        </div>
      </div>

      {/* Opacity */}
      {canShowOpacity ? (
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.opacityLabel}</span>
            <div className="text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
              {(opacityState?.opacity ?? 1).toFixed(2)}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacityState?.opacity ?? 1}
            disabled={isDisabled}
            onChange={(e) => previewOpacity(Number(e.target.value))}
            onPointerUp={(e) => commitOpacity(Number((e.target as HTMLInputElement).value))}
            className="w-full disabled:opacity-50"
          />
        </div>
      ) : null}

      {/* Render Order */}
      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.renderOrderLabel}</span>
          <div className="text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
            {Math.max(0, Math.min(999, Math.round(renderOrderState?.renderOrder ?? 0)))}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={999}
          step={1}
          value={Math.max(0, Math.min(999, Math.round(renderOrderState?.renderOrder ?? 0)))}
          disabled={isDisabled || !renderOrderState?.canRenderOrder}
          onChange={(e) => previewRenderOrder(Number(e.target.value))}
          onPointerUp={(e) => commitRenderOrder(Number((e.target as HTMLInputElement).value))}
          className="w-full disabled:opacity-50"
        />
      </div>
    </div>
  );
}

