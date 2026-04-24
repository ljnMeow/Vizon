import type { AppMessages } from '../../../../i18n/messages';

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
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{label}</label>
      <input
        type="number"
        value={value}
        disabled={disabled}
        step={step ?? 0.01}
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
  setFrustumCulled
}: {
  labels: PropertiesLabels;
  selectedInfo: SelectedObjectInfo;
  transform: TransformState | null;
  shadow: ShadowState | null;
  visibilityPickFreeze: VisibilityPickFreezeState | null;
  opacityState: OpacityState | null;
  renderOrderState: RenderOrderState | null;
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
}) {
  const isDisabled = !selectedInfo;

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

      {/* Shadow */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.shadowTitleLabel}</div>

        {/* 产生 / 接受：独占两行（框内） */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
          <label className="flex cursor-pointer items-center justify-between gap-2">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.castShadowLabel}</span>
            <input
              type="checkbox"
              checked={shadow?.castShadow ?? false}
              disabled={isDisabled || !shadow?.canCastShadow}
              onChange={(e) => setCastShadow(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-2">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.receiveShadowLabel}</span>
            <input
              type="checkbox"
              checked={shadow?.receiveShadow ?? false}
              disabled={isDisabled || !shadow?.canReceiveShadow}
              onChange={(e) => setReceiveShadow(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </div>

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
                disabled={isDisabled || !shadow?.canFrustumCulled}
                onChange={(e) => setFrustumCulled(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
          </div>
        </div>
      </div>

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

          <label className="flex cursor-pointer items-center justify-between gap-2">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.pickableLabel}</span>
            <input
              type="checkbox"
              checked={visibilityPickFreeze?.pickable ?? false}
              disabled={isDisabled || !visibilityPickFreeze?.canPickable}
              onChange={(e) => setPickable(e.target.checked)}
              className="h-4 w-4"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-2">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{labels.freezeLabel}</span>
            <input
              type="checkbox"
              checked={visibilityPickFreeze?.frozen ?? false}
              disabled={isDisabled || !visibilityPickFreeze?.canFreeze}
              onChange={(e) => setFrozen(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </div>
      </div>

      {/* Opacity */}
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
          disabled={isDisabled || !opacityState?.canOpacity}
          onChange={(e) => previewOpacity(Number(e.target.value))}
          onPointerUp={(e) => commitOpacity(Number((e.target as HTMLInputElement).value))}
          onMouseUp={(e) => commitOpacity(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => commitOpacity(Number((e.target as HTMLInputElement).value))}
          className="w-full disabled:opacity-50"
        />
      </div>

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
          onMouseUp={(e) => commitRenderOrder(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => commitRenderOrder(Number((e.target as HTMLInputElement).value))}
          className="w-full disabled:opacity-50"
        />
      </div>
    </div>
  );
}

