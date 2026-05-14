import type { AppMessages } from '../../../../i18n/messages';
import { ColorPicker } from '../../../../components/ColorPicker';
import { useEffect, useState } from 'react';
import type {
  AxisKey,
  DirectionalLightShadowState,
  HemisphereLightParamsState,
  LightColorState,
  LightIntensityState,
  LightTargetState,
  OpacityState,
  OrthographicCameraParamsState,
  PerspectiveCameraParamsState,
  PointLightParamsState,
  PointLightShadowState,
  RectAreaLightParamsState,
  RenderOrderState,
  SelectedObjectInfo,
  ShadowState,
  SpotLightParamsState,
  SpotLightShadowState,
  TransformState,
  VisibilityPickFreezeState,
} from './propertiesTypes';

/** 属性设置面板使用的 i18n 文案类型 */
type PropertiesLabels = AppMessages['designPage']['inspector']['propertiesSettings'];

/**
 * 单轴数值输入框。
 * 用于 position / rotation / scale 等三轴属性的重复 UI 复用。
 */
function AxisNumberInput({
  label,
  value,
  disabled,
  step,
  finiteFallback = 0,
  onPreviewChange,
  onCommit
}: {
  label: string;
  value: number;
  disabled: boolean;
  step?: number;
  /** position/rotation 用 0；scale 用 1，避免 Infinity/NaN 传入 type="number" 触发浏览器警告 */
  finiteFallback?: number;
  onPreviewChange: (next: number) => void;
  onCommit: (next: number) => void;
}) {
  const safe = Number.isFinite(value) ? value : finiteFallback;
  const [draft, setDraft] = useState(String(safe));

  useEffect(() => {
    const nextSafe = Number.isFinite(value) ? value : finiteFallback;
    setDraft(String(nextSafe));
  }, [value, finiteFallback]);

  const commitDraft = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(safe));
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
  finiteFallback = 0,
  onPreviewChange,
  onCommit
}: {
  label: string;
  value: number;
  disabled: boolean;
  step?: number;
  min?: number;
  max?: number;
  finiteFallback?: number;
  onPreviewChange: (next: number) => void;
  onCommit: (next: number) => void;
}) {
  const safe = Number.isFinite(value) ? value : finiteFallback;
  const [draft, setDraft] = useState(String(safe));

  useEffect(() => {
    const nextSafe = Number.isFinite(value) ? value : finiteFallback;
    setDraft(String(nextSafe));
  }, [value, finiteFallback]);

  const commitDraft = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(safe));
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
  perspectiveCameraParamsState,
  orthographicCameraParamsState,
  lightColorState,
  lightIntensityState,
  directionalLightTargetState,
  spotLightParamsState,
  pointLightParamsState,
  hemisphereLightParamsState,
  rectAreaLightParamsState,
  directionalLightShadowState,
  spotLightShadowState,
  pointLightShadowState,
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
  previewPerspectiveCameraNumber,
  commitPerspectiveCameraNumber,
  previewOrthographicCameraNumber,
  commitOrthographicCameraNumber,
  setCastShadow,
  setReceiveShadow,
  setFrustumCulled,
  previewLightColor,
  commitLightColor,
  previewLightIntensity,
  commitLightIntensity,
  previewDirectionalTargetAxis,
  commitDirectionalTargetAxis,
  previewSpotParamNumber,
  commitSpotParamNumber,
  previewSpotTargetAxis,
  commitSpotTargetAxis,
  previewPointParamNumber,
  commitPointParamNumber,
  previewHemisphereGroundColor,
  commitHemisphereGroundColor,
  previewRectAreaParamNumber,
  commitRectAreaParamNumber,
  previewRectAreaTargetAxis,
  commitRectAreaTargetAxis,
  previewDirectionalShadowNumber,
  commitDirectionalShadowNumber,
  setDirectionalShadowHelperVisible,
  previewSpotShadowNumber,
  commitSpotShadowNumber,
  setSpotShadowHelperVisible,
  previewPointShadowNumber,
  commitPointShadowNumber,
  setPointShadowHelperVisible
}: {
  labels: PropertiesLabels;
  selectedInfo: SelectedObjectInfo;
  transform: TransformState | null;
  shadow: ShadowState | null;
  visibilityPickFreeze: VisibilityPickFreezeState | null;
  opacityState: OpacityState | null;
  renderOrderState: RenderOrderState | null;
  perspectiveCameraParamsState: PerspectiveCameraParamsState | null;
  orthographicCameraParamsState: OrthographicCameraParamsState | null;
  lightColorState: LightColorState | null;
  lightIntensityState: LightIntensityState | null;
  directionalLightTargetState: LightTargetState | null;
  spotLightParamsState: SpotLightParamsState | null;
  pointLightParamsState: PointLightParamsState | null;
  hemisphereLightParamsState: HemisphereLightParamsState | null;
  rectAreaLightParamsState: RectAreaLightParamsState | null;
  directionalLightShadowState: DirectionalLightShadowState | null;
  spotLightShadowState: SpotLightShadowState | null;
  pointLightShadowState: PointLightShadowState | null;
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
  previewPerspectiveCameraNumber: (path: 'fov' | 'near' | 'far' | 'zoom', nextValue: number) => void;
  commitPerspectiveCameraNumber: (path: 'fov' | 'near' | 'far' | 'zoom', nextValue: number) => void;
  previewOrthographicCameraNumber: (
    path: 'left' | 'right' | 'top' | 'bottom' | 'near' | 'far' | 'zoom',
    nextValue: number
  ) => void;
  commitOrthographicCameraNumber: (
    path: 'left' | 'right' | 'top' | 'bottom' | 'near' | 'far' | 'zoom',
    nextValue: number
  ) => void;
  setCastShadow: (nextCastShadow: boolean) => void;
  setReceiveShadow: (nextReceiveShadow: boolean) => void;
  setFrustumCulled: (nextFrustumCulled: boolean) => void;
  previewLightColor: (nextColor: string) => void;
  commitLightColor: (nextColor: string) => void;
  previewLightIntensity: (nextIntensity: number) => void;
  commitLightIntensity: (nextIntensity: number) => void;
  previewDirectionalTargetAxis: (axis: AxisKey, next: number) => void;
  commitDirectionalTargetAxis: (axis: AxisKey, next: number) => void;
  previewSpotParamNumber: (path: 'distance' | 'angle' | 'penumbra' | 'decay' | 'focus', nextValue: number) => void;
  commitSpotParamNumber: (path: 'distance' | 'angle' | 'penumbra' | 'decay' | 'focus', nextValue: number) => void;
  previewSpotTargetAxis: (axis: AxisKey, next: number) => void;
  commitSpotTargetAxis: (axis: AxisKey, next: number) => void;
  previewPointParamNumber: (path: 'distance' | 'decay', nextValue: number) => void;
  commitPointParamNumber: (path: 'distance' | 'decay', nextValue: number) => void;
  previewHemisphereGroundColor: (nextColor: string) => void;
  commitHemisphereGroundColor: (nextColor: string) => void;
  previewRectAreaParamNumber: (path: 'width' | 'height', nextValue: number) => void;
  commitRectAreaParamNumber: (path: 'width' | 'height', nextValue: number) => void;
  previewRectAreaTargetAxis: (axis: AxisKey, next: number) => void;
  commitRectAreaTargetAxis: (axis: AxisKey, next: number) => void;
  previewDirectionalShadowNumber: (
    path:
      | 'shadow.intensity'
      | 'shadow.bias'
      | 'shadow.normalBias'
      | 'shadow.radius'
      | 'shadow.mapSize.width'
      | 'shadow.mapSize.height'
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
      | 'shadow.mapSize.width'
      | 'shadow.mapSize.height'
      | 'shadow.camera.left'
      | 'shadow.camera.right'
      | 'shadow.camera.top'
      | 'shadow.camera.bottom'
      | 'shadow.camera.near'
      | 'shadow.camera.far',
    nextValue: number
  ) => void;
  setDirectionalShadowHelperVisible: (nextVisible: boolean) => void;
  previewSpotShadowNumber: (
    path:
      | 'shadow.intensity'
      | 'shadow.bias'
      | 'shadow.normalBias'
      | 'shadow.radius'
      | 'shadow.mapSize.width'
      | 'shadow.mapSize.height'
      | 'shadow.camera.near'
      | 'shadow.camera.far'
      | 'shadow.camera.fov',
    nextValue: number
  ) => void;
  commitSpotShadowNumber: (
    path:
      | 'shadow.intensity'
      | 'shadow.bias'
      | 'shadow.normalBias'
      | 'shadow.radius'
      | 'shadow.mapSize.width'
      | 'shadow.mapSize.height'
      | 'shadow.camera.near'
      | 'shadow.camera.far'
      | 'shadow.camera.fov',
    nextValue: number
  ) => void;
  setSpotShadowHelperVisible: (nextVisible: boolean) => void;
  previewPointShadowNumber: (
    path:
      | 'shadow.intensity'
      | 'shadow.bias'
      | 'shadow.normalBias'
      | 'shadow.radius'
      | 'shadow.mapSize.width'
      | 'shadow.mapSize.height'
      | 'shadow.camera.near'
      | 'shadow.camera.far',
    nextValue: number
  ) => void;
  commitPointShadowNumber: (
    path:
      | 'shadow.intensity'
      | 'shadow.bias'
      | 'shadow.normalBias'
      | 'shadow.radius'
      | 'shadow.mapSize.width'
      | 'shadow.mapSize.height'
      | 'shadow.camera.near'
      | 'shadow.camera.far',
    nextValue: number
  ) => void;
  setPointShadowHelperVisible: (nextVisible: boolean) => void;
}) {
  const isDisabled = !selectedInfo;
  const isLightObject = Boolean(selectedInfo?.type?.endsWith('Light'));
  const isShadowCapableLight =
    selectedInfo?.type === 'DirectionalLight' || selectedInfo?.type === 'SpotLight' || selectedInfo?.type === 'PointLight';
  const baseShadowAvailability =
    Boolean(shadow?.canCastShadow) || Boolean(shadow?.canReceiveShadow) || Boolean(shadow?.canFrustumCulled);
  const canShowShadow = isLightObject ? isShadowCapableLight && baseShadowAvailability : baseShadowAvailability;
  const canShowPickable = Boolean(visibilityPickFreeze?.canPickable);
  const canShowFreeze = Boolean(visibilityPickFreeze?.canFreeze);
  const canShowOpacity = Boolean(opacityState?.canOpacity);
  const canShowLightColor = Boolean(lightColorState?.canColor);
  const canShowLightIntensity = Boolean(lightIntensityState?.canIntensity);
  const canShowPerspectiveCameraParams =
    selectedInfo?.type === 'PerspectiveCamera' && Boolean(perspectiveCameraParamsState?.canEdit);
  const canShowOrthographicCameraParams =
    selectedInfo?.type === 'OrthographicCamera' && Boolean(orthographicCameraParamsState?.canEdit);
  const canShowCameraParams = canShowPerspectiveCameraParams || canShowOrthographicCameraParams;
  const canShowDirectionalLightParams =
    selectedInfo?.type === 'DirectionalLight' && Boolean(directionalLightTargetState?.canEdit);
  const canShowSpotLightParams = selectedInfo?.type === 'SpotLight' && Boolean(spotLightParamsState?.canEdit);
  const canShowPointLightParams = selectedInfo?.type === 'PointLight' && Boolean(pointLightParamsState?.canEdit);
  const canShowHemisphereLightParams =
    selectedInfo?.type === 'HemisphereLight' && Boolean(hemisphereLightParamsState?.canEdit);
  const canShowRectAreaLightParams = selectedInfo?.type === 'RectAreaLight' && Boolean(rectAreaLightParamsState?.canEdit);
  const canShowLightParams =
    canShowDirectionalLightParams ||
    canShowSpotLightParams ||
    canShowPointLightParams ||
    canShowHemisphereLightParams ||
    canShowRectAreaLightParams;
  const canShowDirectionalLightShadow = Boolean(shadow?.castShadow) && Boolean(directionalLightShadowState?.canEdit);
  const canShowSpotLightShadow = Boolean(shadow?.castShadow) && Boolean(spotLightShadowState?.canEdit);
  const canShowPointLightShadow = Boolean(shadow?.castShadow) && Boolean(pointLightShadowState?.canEdit);
  const lightColorLabel = ((labels as any).colorLabel as string | undefined) ?? 'Color';
  const lightParamsTitleLabel = ((labels as any).lightParamsTitleLabel as string | undefined) ?? 'Light Params';
  const lightTargetLabel = ((labels as any).lightTargetLabel as string | undefined) ?? 'Target';
  const lightDistanceLabel = ((labels as any).lightDistanceLabel as string | undefined) ?? 'Distance';
  const lightDecayLabel = ((labels as any).lightDecayLabel as string | undefined) ?? 'Decay';
  const spotAngleLabel = ((labels as any).spotAngleLabel as string | undefined) ?? 'Angle';
  const spotPenumbraLabel = ((labels as any).spotPenumbraLabel as string | undefined) ?? 'Penumbra';
  const spotFocusLabel = ((labels as any).spotFocusLabel as string | undefined) ?? 'Focus';
  const hemisphereGroundColorLabel = ((labels as any).hemisphereGroundColorLabel as string | undefined) ?? 'Ground Color';
  const rectAreaWidthLabel = ((labels as any).rectAreaWidthLabel as string | undefined) ?? 'Width';
  const rectAreaHeightLabel = ((labels as any).rectAreaHeightLabel as string | undefined) ?? 'Height';
  const shadowCameraRangeTitleLabel = ((labels as any).shadowCameraRangeTitleLabel as string | undefined) ?? 'Shadow Camera Range';
  const shadowMapSizeTitleLabel = ((labels as any).shadowMapSizeTitleLabel as string | undefined) ?? 'Shadow Map Size';
  const shadowMapSizeWidthLabel = ((labels as any).shadowMapSizeWidthLabel as string | undefined) ?? 'Width';
  const shadowMapSizeHeightLabel = ((labels as any).shadowMapSizeHeightLabel as string | undefined) ?? 'Height';
  const shadowCameraLeftLabel = ((labels as any).shadowCameraLeftLabel as string | undefined) ?? 'Left';
  const shadowCameraRightLabel = ((labels as any).shadowCameraRightLabel as string | undefined) ?? 'Right';
  const shadowCameraTopLabel = ((labels as any).shadowCameraTopLabel as string | undefined) ?? 'Top';
  const shadowCameraBottomLabel = ((labels as any).shadowCameraBottomLabel as string | undefined) ?? 'Bottom';
  const shadowCameraNearLabel = ((labels as any).shadowCameraNearLabel as string | undefined) ?? 'Near';
  const shadowCameraFarLabel = ((labels as any).shadowCameraFarLabel as string | undefined) ?? 'Far';
  const shadowCameraFovLabel = ((labels as any).shadowCameraFovLabel as string | undefined) ?? 'FOV';
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
            finiteFallback={1}
            onPreviewChange={(v) => previewScaleAxis('x', v)}
            onCommit={(v) => commitScaleAxis('x', v)}
          />
          <AxisNumberInput
            label={labels.yLabel}
            value={transform?.scale.y ?? 1}
            disabled={isDisabled}
            step={0.01}
            finiteFallback={1}
            onPreviewChange={(v) => previewScaleAxis('y', v)}
            onCommit={(v) => commitScaleAxis('y', v)}
          />
          <AxisNumberInput
            label={labels.zLabel}
            value={transform?.scale.z ?? 1}
            disabled={isDisabled}
            step={0.01}
            finiteFallback={1}
            onPreviewChange={(v) => previewScaleAxis('z', v)}
            onCommit={(v) => commitScaleAxis('z', v)}
          />
        </div>
      </div>

      {/* Camera */}
      {canShowCameraParams ? (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.cameraParamsTitleLabel}</div>
          {canShowPerspectiveCameraParams ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.cameraFovLabel}
                  value={perspectiveCameraParamsState?.fov ?? 50}
                  disabled={isDisabled}
                  step={0.1}
                  min={0.1}
                  max={179.9}
                  onPreviewChange={(v) => previewPerspectiveCameraNumber('fov', v)}
                  onCommit={(v) => commitPerspectiveCameraNumber('fov', v)}
                />
                <LabeledNumberInput
                  label={labels.cameraZoomLabel}
                  value={perspectiveCameraParamsState?.zoom ?? 1}
                  disabled={isDisabled}
                  step={0.01}
                  min={0.01}
                  onPreviewChange={(v) => previewPerspectiveCameraNumber('zoom', v)}
                  onCommit={(v) => commitPerspectiveCameraNumber('zoom', v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.cameraNearLabel}
                  value={perspectiveCameraParamsState?.near ?? 0.1}
                  disabled={isDisabled}
                  step={0.01}
                  min={0.000001}
                  onPreviewChange={(v) => previewPerspectiveCameraNumber('near', v)}
                  onCommit={(v) => commitPerspectiveCameraNumber('near', v)}
                />
                <LabeledNumberInput
                  label={labels.cameraFarLabel}
                  value={perspectiveCameraParamsState?.far ?? 200}
                  disabled={isDisabled}
                  step={0.1}
                  min={0.000001}
                  onPreviewChange={(v) => previewPerspectiveCameraNumber('far', v)}
                  onCommit={(v) => commitPerspectiveCameraNumber('far', v)}
                />
              </div>
            </div>
          ) : null}

          {canShowOrthographicCameraParams ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.cameraZoomLabel}
                  value={orthographicCameraParamsState?.zoom ?? 1}
                  disabled={isDisabled}
                  step={0.01}
                  min={0.01}
                  onPreviewChange={(v) => previewOrthographicCameraNumber('zoom', v)}
                  onCommit={(v) => commitOrthographicCameraNumber('zoom', v)}
                />
                <div />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.cameraLeftLabel}
                  value={orthographicCameraParamsState?.left ?? -1}
                  disabled={isDisabled}
                  step={0.1}
                  onPreviewChange={(v) => previewOrthographicCameraNumber('left', v)}
                  onCommit={(v) => commitOrthographicCameraNumber('left', v)}
                />
                <LabeledNumberInput
                  label={labels.cameraRightLabel}
                  value={orthographicCameraParamsState?.right ?? 1}
                  disabled={isDisabled}
                  step={0.1}
                  onPreviewChange={(v) => previewOrthographicCameraNumber('right', v)}
                  onCommit={(v) => commitOrthographicCameraNumber('right', v)}
                />
                <LabeledNumberInput
                  label={labels.cameraTopLabel}
                  value={orthographicCameraParamsState?.top ?? 1}
                  disabled={isDisabled}
                  step={0.1}
                  onPreviewChange={(v) => previewOrthographicCameraNumber('top', v)}
                  onCommit={(v) => commitOrthographicCameraNumber('top', v)}
                />
                <LabeledNumberInput
                  label={labels.cameraBottomLabel}
                  value={orthographicCameraParamsState?.bottom ?? -1}
                  disabled={isDisabled}
                  step={0.1}
                  onPreviewChange={(v) => previewOrthographicCameraNumber('bottom', v)}
                  onCommit={(v) => commitOrthographicCameraNumber('bottom', v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.cameraNearLabel}
                  value={orthographicCameraParamsState?.near ?? 0.1}
                  disabled={isDisabled}
                  step={0.01}
                  min={0.000001}
                  onPreviewChange={(v) => previewOrthographicCameraNumber('near', v)}
                  onCommit={(v) => commitOrthographicCameraNumber('near', v)}
                />
                <LabeledNumberInput
                  label={labels.cameraFarLabel}
                  value={orthographicCameraParamsState?.far ?? 200}
                  disabled={isDisabled}
                  step={0.1}
                  min={0.000001}
                  onPreviewChange={(v) => previewOrthographicCameraNumber('far', v)}
                  onCommit={(v) => commitOrthographicCameraNumber('far', v)}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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

      {canShowLightParams ? (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{lightParamsTitleLabel}</div>

          {canShowDirectionalLightParams ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              <div className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{lightTargetLabel}</div>
              <div className="grid grid-cols-3 gap-2">
                <AxisNumberInput
                  label={labels.xLabel}
                  value={directionalLightTargetState?.target.x ?? 0}
                  disabled={isDisabled}
                  onPreviewChange={(v) => previewDirectionalTargetAxis('x', v)}
                  onCommit={(v) => commitDirectionalTargetAxis('x', v)}
                />
                <AxisNumberInput
                  label={labels.yLabel}
                  value={directionalLightTargetState?.target.y ?? 0}
                  disabled={isDisabled}
                  onPreviewChange={(v) => previewDirectionalTargetAxis('y', v)}
                  onCommit={(v) => commitDirectionalTargetAxis('y', v)}
                />
                <AxisNumberInput
                  label={labels.zLabel}
                  value={directionalLightTargetState?.target.z ?? 0}
                  disabled={isDisabled}
                  onPreviewChange={(v) => previewDirectionalTargetAxis('z', v)}
                  onCommit={(v) => commitDirectionalTargetAxis('z', v)}
                />
              </div>
            </div>
          ) : null}

          {canShowSpotLightParams ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={lightDistanceLabel}
                  value={spotLightParamsState?.distance ?? 0}
                  disabled={isDisabled}
                  step={0.1}
                  min={0}
                  onPreviewChange={(v) => previewSpotParamNumber('distance', v)}
                  onCommit={(v) => commitSpotParamNumber('distance', v)}
                />
                <LabeledNumberInput
                  label={lightDecayLabel}
                  value={spotLightParamsState?.decay ?? 2}
                  disabled={isDisabled}
                  step={0.1}
                  min={0}
                  onPreviewChange={(v) => previewSpotParamNumber('decay', v)}
                  onCommit={(v) => commitSpotParamNumber('decay', v)}
                />
                <LabeledNumberInput
                  label={spotAngleLabel}
                  value={spotLightParamsState?.angle ?? 0.5}
                  disabled={isDisabled}
                  step={0.01}
                  min={0.0001}
                  max={Math.PI / 2}
                  onPreviewChange={(v) => previewSpotParamNumber('angle', v)}
                  onCommit={(v) => commitSpotParamNumber('angle', v)}
                />
                <LabeledNumberInput
                  label={spotPenumbraLabel}
                  value={spotLightParamsState?.penumbra ?? 0}
                  disabled={isDisabled}
                  step={0.01}
                  min={0}
                  max={1}
                  onPreviewChange={(v) => previewSpotParamNumber('penumbra', v)}
                  onCommit={(v) => commitSpotParamNumber('penumbra', v)}
                />
                <LabeledNumberInput
                  label={spotFocusLabel}
                  value={spotLightParamsState?.focus ?? 1}
                  disabled={isDisabled}
                  step={0.01}
                  min={0}
                  max={1}
                  onPreviewChange={(v) => previewSpotParamNumber('focus', v)}
                  onCommit={(v) => commitSpotParamNumber('focus', v)}
                />
              </div>

              <div className="border-t border-[var(--border-subtle)] pt-2 space-y-2">
                <div className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{lightTargetLabel}</div>
                <div className="grid grid-cols-3 gap-2">
                  <AxisNumberInput
                    label={labels.xLabel}
                    value={spotLightParamsState?.target.x ?? 0}
                    disabled={isDisabled}
                    onPreviewChange={(v) => previewSpotTargetAxis('x', v)}
                    onCommit={(v) => commitSpotTargetAxis('x', v)}
                  />
                  <AxisNumberInput
                    label={labels.yLabel}
                    value={spotLightParamsState?.target.y ?? 0}
                    disabled={isDisabled}
                    onPreviewChange={(v) => previewSpotTargetAxis('y', v)}
                    onCommit={(v) => commitSpotTargetAxis('y', v)}
                  />
                  <AxisNumberInput
                    label={labels.zLabel}
                    value={spotLightParamsState?.target.z ?? 0}
                    disabled={isDisabled}
                    onPreviewChange={(v) => previewSpotTargetAxis('z', v)}
                    onCommit={(v) => commitSpotTargetAxis('z', v)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {canShowPointLightParams ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={lightDistanceLabel}
                  value={pointLightParamsState?.distance ?? 0}
                  disabled={isDisabled}
                  step={0.1}
                  min={0}
                  onPreviewChange={(v) => previewPointParamNumber('distance', v)}
                  onCommit={(v) => commitPointParamNumber('distance', v)}
                />
                <LabeledNumberInput
                  label={lightDecayLabel}
                  value={pointLightParamsState?.decay ?? 2}
                  disabled={isDisabled}
                  step={0.1}
                  min={0}
                  onPreviewChange={(v) => previewPointParamNumber('decay', v)}
                  onCommit={(v) => commitPointParamNumber('decay', v)}
                />
              </div>
            </div>
          ) : null}

          {canShowHemisphereLightParams ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                {hemisphereGroundColorLabel}
              </label>
              <ColorPicker
                value={hemisphereLightParamsState?.groundColor ?? '#ffffff'}
                onChange={previewHemisphereGroundColor}
                onCommit={commitHemisphereGroundColor}
                disabled={isDisabled}
                ariaLabel={hemisphereGroundColorLabel}
                showValue={true}
              />
            </div>
          ) : null}

          {canShowRectAreaLightParams ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={rectAreaWidthLabel}
                  value={rectAreaLightParamsState?.width ?? 1}
                  disabled={isDisabled}
                  step={0.05}
                  min={0.0001}
                  onPreviewChange={(v) => previewRectAreaParamNumber('width', v)}
                  onCommit={(v) => commitRectAreaParamNumber('width', v)}
                />
                <LabeledNumberInput
                  label={rectAreaHeightLabel}
                  value={rectAreaLightParamsState?.height ?? 1}
                  disabled={isDisabled}
                  step={0.05}
                  min={0.0001}
                  onPreviewChange={(v) => previewRectAreaParamNumber('height', v)}
                  onCommit={(v) => commitRectAreaParamNumber('height', v)}
                />
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-2 space-y-2">
                <div className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{lightTargetLabel}</div>
                <div className="grid grid-cols-3 gap-2">
                  <AxisNumberInput
                    label={labels.xLabel}
                    value={rectAreaLightParamsState?.target.x ?? 0}
                    disabled={isDisabled}
                    onPreviewChange={(v) => previewRectAreaTargetAxis('x', v)}
                    onCommit={(v) => commitRectAreaTargetAxis('x', v)}
                  />
                  <AxisNumberInput
                    label={labels.yLabel}
                    value={rectAreaLightParamsState?.target.y ?? 0}
                    disabled={isDisabled}
                    onPreviewChange={(v) => previewRectAreaTargetAxis('y', v)}
                    onCommit={(v) => commitRectAreaTargetAxis('y', v)}
                  />
                  <AxisNumberInput
                    label={labels.zLabel}
                    value={rectAreaLightParamsState?.target.z ?? 0}
                    disabled={isDisabled}
                    onPreviewChange={(v) => previewRectAreaTargetAxis('z', v)}
                    onCommit={(v) => commitRectAreaTargetAxis('z', v)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
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
                <div className="mb-2 text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{shadowMapSizeTitleLabel}</div>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledNumberInput
                    label={shadowMapSizeWidthLabel}
                    value={directionalLightShadowState?.mapSizeWidth ?? 1024}
                    disabled={isDisabled}
                    step={1}
                    min={1}
                    onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.mapSize.width', v)}
                    onCommit={(v) => commitDirectionalShadowNumber('shadow.mapSize.width', v)}
                  />
                  <LabeledNumberInput
                    label={shadowMapSizeHeightLabel}
                    value={directionalLightShadowState?.mapSizeHeight ?? 1024}
                    disabled={isDisabled}
                    step={1}
                    min={1}
                    onPreviewChange={(v) => previewDirectionalShadowNumber('shadow.mapSize.height', v)}
                    onCommit={(v) => commitDirectionalShadowNumber('shadow.mapSize.height', v)}
                  />
                </div>
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
          {canShowSpotLightShadow ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.shadowIntensityLabel}
                  value={spotLightShadowState?.intensity ?? 1}
                  disabled={isDisabled}
                  step={0.05}
                  min={0}
                  max={1}
                  onPreviewChange={(v) => previewSpotShadowNumber('shadow.intensity', v)}
                  onCommit={(v) => commitSpotShadowNumber('shadow.intensity', v)}
                />
                <LabeledNumberInput
                  label={labels.shadowRadiusLabel}
                  value={spotLightShadowState?.radius ?? 1}
                  disabled={isDisabled}
                  step={0.1}
                  min={0}
                  onPreviewChange={(v) => previewSpotShadowNumber('shadow.radius', v)}
                  onCommit={(v) => commitSpotShadowNumber('shadow.radius', v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.shadowBiasLabel}
                  value={spotLightShadowState?.bias ?? 0}
                  disabled={isDisabled}
                  step={0.0001}
                  onPreviewChange={(v) => previewSpotShadowNumber('shadow.bias', v)}
                  onCommit={(v) => commitSpotShadowNumber('shadow.bias', v)}
                />
                <LabeledNumberInput
                  label={labels.shadowNormalBiasLabel}
                  value={spotLightShadowState?.normalBias ?? 0}
                  disabled={isDisabled}
                  step={0.001}
                  min={0}
                  onPreviewChange={(v) => previewSpotShadowNumber('shadow.normalBias', v)}
                  onCommit={(v) => commitSpotShadowNumber('shadow.normalBias', v)}
                />
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-2">
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                    {shadowHelperVisibleLabel}
                  </span>
                  <input
                    type="checkbox"
                    checked={spotLightShadowState?.helperVisible ?? true}
                    disabled={isDisabled}
                    onChange={(e) => setSpotShadowHelperVisible(e.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-2">
                <div className="mb-2 text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{shadowMapSizeTitleLabel}</div>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledNumberInput
                    label={shadowMapSizeWidthLabel}
                    value={spotLightShadowState?.mapSizeWidth ?? 1024}
                    disabled={isDisabled}
                    step={1}
                    min={1}
                    onPreviewChange={(v) => previewSpotShadowNumber('shadow.mapSize.width', v)}
                    onCommit={(v) => commitSpotShadowNumber('shadow.mapSize.width', v)}
                  />
                  <LabeledNumberInput
                    label={shadowMapSizeHeightLabel}
                    value={spotLightShadowState?.mapSizeHeight ?? 1024}
                    disabled={isDisabled}
                    step={1}
                    min={1}
                    onPreviewChange={(v) => previewSpotShadowNumber('shadow.mapSize.height', v)}
                    onCommit={(v) => commitSpotShadowNumber('shadow.mapSize.height', v)}
                  />
                </div>
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-2">
                <div className="mb-2 text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                  {shadowCameraRangeTitleLabel}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledNumberInput
                    label={shadowCameraNearLabel}
                    value={spotLightShadowState?.near ?? 0.1}
                    disabled={isDisabled}
                    step={0.1}
                    onPreviewChange={(v) => previewSpotShadowNumber('shadow.camera.near', v)}
                    onCommit={(v) => commitSpotShadowNumber('shadow.camera.near', v)}
                  />
                  <LabeledNumberInput
                    label={shadowCameraFarLabel}
                    value={spotLightShadowState?.far ?? 20}
                    disabled={isDisabled}
                    step={0.1}
                    onPreviewChange={(v) => previewSpotShadowNumber('shadow.camera.far', v)}
                    onCommit={(v) => commitSpotShadowNumber('shadow.camera.far', v)}
                  />
                  <LabeledNumberInput
                    label={shadowCameraFovLabel}
                    value={spotLightShadowState?.fov ?? 45}
                    disabled={isDisabled}
                    step={0.1}
                    min={0.1}
                    max={179.9}
                    onPreviewChange={(v) => previewSpotShadowNumber('shadow.camera.fov', v)}
                    onCommit={(v) => commitSpotShadowNumber('shadow.camera.fov', v)}
                  />
                </div>
              </div>
            </div>
          ) : null}
          {canShowPointLightShadow ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.shadowIntensityLabel}
                  value={pointLightShadowState?.intensity ?? 1}
                  disabled={isDisabled}
                  step={0.05}
                  min={0}
                  max={1}
                  onPreviewChange={(v) => previewPointShadowNumber('shadow.intensity', v)}
                  onCommit={(v) => commitPointShadowNumber('shadow.intensity', v)}
                />
                <LabeledNumberInput
                  label={labels.shadowRadiusLabel}
                  value={pointLightShadowState?.radius ?? 1}
                  disabled={isDisabled}
                  step={0.1}
                  min={0}
                  onPreviewChange={(v) => previewPointShadowNumber('shadow.radius', v)}
                  onCommit={(v) => commitPointShadowNumber('shadow.radius', v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LabeledNumberInput
                  label={labels.shadowBiasLabel}
                  value={pointLightShadowState?.bias ?? 0}
                  disabled={isDisabled}
                  step={0.0001}
                  onPreviewChange={(v) => previewPointShadowNumber('shadow.bias', v)}
                  onCommit={(v) => commitPointShadowNumber('shadow.bias', v)}
                />
                <LabeledNumberInput
                  label={labels.shadowNormalBiasLabel}
                  value={pointLightShadowState?.normalBias ?? 0}
                  disabled={isDisabled}
                  step={0.001}
                  min={0}
                  onPreviewChange={(v) => previewPointShadowNumber('shadow.normalBias', v)}
                  onCommit={(v) => commitPointShadowNumber('shadow.normalBias', v)}
                />
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-2">
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                    {shadowHelperVisibleLabel}
                  </span>
                  <input
                    type="checkbox"
                    checked={pointLightShadowState?.helperVisible ?? true}
                    disabled={isDisabled}
                    onChange={(e) => setPointShadowHelperVisible(e.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-2">
                <div className="mb-2 text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{shadowMapSizeTitleLabel}</div>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledNumberInput
                    label={shadowMapSizeWidthLabel}
                    value={pointLightShadowState?.mapSizeWidth ?? 1024}
                    disabled={isDisabled}
                    step={1}
                    min={1}
                    onPreviewChange={(v) => previewPointShadowNumber('shadow.mapSize.width', v)}
                    onCommit={(v) => commitPointShadowNumber('shadow.mapSize.width', v)}
                  />
                  <LabeledNumberInput
                    label={shadowMapSizeHeightLabel}
                    value={pointLightShadowState?.mapSizeHeight ?? 1024}
                    disabled={isDisabled}
                    step={1}
                    min={1}
                    onPreviewChange={(v) => previewPointShadowNumber('shadow.mapSize.height', v)}
                    onCommit={(v) => commitPointShadowNumber('shadow.mapSize.height', v)}
                  />
                </div>
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-2">
                <div className="mb-2 text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                  {shadowCameraRangeTitleLabel}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledNumberInput
                    label={shadowCameraNearLabel}
                    value={pointLightShadowState?.near ?? 0.1}
                    disabled={isDisabled}
                    step={0.1}
                    onPreviewChange={(v) => previewPointShadowNumber('shadow.camera.near', v)}
                    onCommit={(v) => commitPointShadowNumber('shadow.camera.near', v)}
                  />
                  <LabeledNumberInput
                    label={shadowCameraFarLabel}
                    value={pointLightShadowState?.far ?? 20}
                    disabled={isDisabled}
                    step={0.1}
                    onPreviewChange={(v) => previewPointShadowNumber('shadow.camera.far', v)}
                    onCommit={(v) => commitPointShadowNumber('shadow.camera.far', v)}
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

