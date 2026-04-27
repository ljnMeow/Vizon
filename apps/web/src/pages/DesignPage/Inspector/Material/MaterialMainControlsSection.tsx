import { ColorPicker } from '../../../../components/ColorPicker';
import type { MaterialBlendingKey, MaterialSideKey, MaterialTypeKey } from './materialConstants';

/**
 * 材质主控区的 props 定义，由 MaterialSettings 父组件组装后传入。
 * 所有 onChange 回调负责将 UI 变更同步回 three.js 材质对象并更新历史记录。
 */
type MaterialMainControlsSectionProps = {
  p: any;
  selectedMaterialType: MaterialTypeKey;
  options: Array<{ key: MaterialTypeKey; label: string }>;
  selectedMaterialSide: MaterialSideKey | null;
  sideOptionsList: Array<{ key: MaterialSideKey; label: string }>;
  selectedBlendingMode: MaterialBlendingKey | null;
  blendingOptionsList: Array<{ key: MaterialBlendingKey; label: string }>;
  blendingDescriptions: Record<string, string>;
  selectedMaterialColor: string | null;
  selectedMaterialTransparentEnabled: boolean;
  selectedMaterialOpacity: number;
  selectedMaterialWireframe: boolean;
  selectedMaterialForceSingleChannelEnabled: boolean;
  selectedMaterialAlphaTestThreshold: number;
  selectedMaterialDepthTest: boolean;
  selectedMaterialDepthWrite: boolean;
  selectedVertexColorsEnabled: boolean;
  selectedVertexColor: string;
  onMaterialTypeChange: (next: MaterialTypeKey) => void;
  onMaterialSideChange: (next: MaterialSideKey) => void;
  onBlendingChange: (next: MaterialBlendingKey) => void;
  onMaterialColorChange: (next: string) => void;
  onTransparentEnabledChange: (next: boolean) => void;
  onOpacityPreviewChange: (next: number) => void;
  onOpacityCommit: (next: number) => void;
  onOpacityDragStart: () => void;
  onWireframeChange: (next: boolean) => void;
  onForceSingleChannelChange: (next: boolean) => void;
  onAlphaTestPreviewChange: (next: number) => void;
  onAlphaTestCommit: (next: number) => void;
  onAlphaTestDragStart: () => void;
  onDepthTestChange: (next: boolean) => void;
  onDepthWriteChange: (next: boolean) => void;
  onVertexColorsEnabledChange: (next: boolean) => void;
  onVertexColorChange: (next: string) => void;
};

/**
 * 材质主控区：涵盖类型、面剔除、混合模式、颜色、透明度、线框、深度及顶点色等基础设置。
 */
export function MaterialMainControlsSection(props: MaterialMainControlsSectionProps) {
  const {
    p,
    selectedMaterialType,
    options,
    selectedMaterialSide,
    sideOptionsList,
    selectedBlendingMode,
    blendingOptionsList,
    blendingDescriptions,
    selectedMaterialColor,
    selectedMaterialTransparentEnabled,
    selectedMaterialOpacity,
    selectedMaterialWireframe,
    selectedMaterialForceSingleChannelEnabled,
    selectedMaterialAlphaTestThreshold,
    selectedMaterialDepthTest,
    selectedMaterialDepthWrite,
    selectedVertexColorsEnabled,
    selectedVertexColor,
    onMaterialTypeChange,
    onMaterialSideChange,
    onBlendingChange,
    onMaterialColorChange,
    onTransparentEnabledChange,
  onOpacityPreviewChange,
  onOpacityCommit,
  onOpacityDragStart,
    onWireframeChange,
    onForceSingleChannelChange,
  onAlphaTestPreviewChange,
  onAlphaTestCommit,
  onAlphaTestDragStart,
    onDepthTestChange,
    onDepthWriteChange,
    onVertexColorsEnabledChange,
    onVertexColorChange,
  } = props;

  return (
    <>
      {/* 材质类型：切换时会触发底层材质重建/映射逻辑 */}
      <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialTypeLabel}</label>
      <select
        value={selectedMaterialType}
        onChange={(e) => onMaterialTypeChange(e.target.value as MaterialTypeKey)}
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      >
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
      {selectedMaterialSide ? (
        <div className="space-y-1 pt-2">
          {/* 面剔除方向：并非所有材质都支持展示该项 */}
          <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialSideLabel}</label>
          <select
            value={selectedMaterialSide}
            onChange={(e) => onMaterialSideChange(e.target.value as MaterialSideKey)}
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          >
            {sideOptionsList.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {selectedBlendingMode ? (
        <div className="space-y-1 pt-2">
          {/* 混合模式：描述文本用于提示不同模式下的视觉差异 */}
          <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialBlendingLabel}</label>
          <select
            value={selectedBlendingMode}
            onChange={(e) => onBlendingChange(e.target.value as MaterialBlendingKey)}
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          >
            {blendingOptionsList.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          {blendingDescriptions[selectedBlendingMode] ? (
            <div className="text-[10px] leading-snug text-[var(--text-secondary)]">{blendingDescriptions[selectedBlendingMode]}</div>
          ) : null}
        </div>
      ) : null}
      {selectedMaterialColor ? (
        <div className="space-y-1 pt-2">
          {/* 仅在材质暴露 color 属性时显示颜色面板 */}
          <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialColorLabel}</label>
          <ColorPicker value={selectedMaterialColor} ariaLabel={p.materialColorLabel} showValue={true} onChange={onMaterialColorChange} />
        </div>
      ) : null}
      <div className="space-y-1 pt-2">
        {/* 透明开关与透明度滑杆拆分：避免 opacity 改动反向影响开关状态 */}
        <label className="flex cursor-pointer items-center justify-between gap-3 pt-2">
          <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialTransparentEnabledLabel}</span>
          <input type="checkbox" checked={selectedMaterialTransparentEnabled} onChange={(e) => onTransparentEnabledChange(e.target.checked)} className="h-4 w-4" />
        </label>
        {selectedMaterialTransparentEnabled ? (
          <>
            <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialOpacityLabel}</label>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={1} step={0.01} value={selectedMaterialOpacity} disabled={!selectedMaterialTransparentEnabled} onPointerDown={onOpacityDragStart} onChange={(e) => onOpacityPreviewChange(Number(e.target.value))} onPointerUp={(e) => onOpacityCommit(Number((e.target as HTMLInputElement).value))} aria-label={p.materialOpacityLabel} className="w-full" />
              <div className="w-12 text-right text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{selectedMaterialOpacity.toFixed(2)}</div>
            </div>
          </>
        ) : null}
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 pt-2">
        <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialWireframeLabel}</span>
        <input type="checkbox" checked={selectedMaterialWireframe} onChange={(e) => onWireframeChange(e.target.checked)} className="h-4 w-4" />
      </label>
      <label className="flex cursor-pointer items-center justify-between gap-3 pt-2">
        <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialForceSingleChannelLabel}</span>
        <input type="checkbox" checked={selectedMaterialForceSingleChannelEnabled} onChange={(e) => onForceSingleChannelChange(e.target.checked)} className="h-4 w-4" />
      </label>
      <div className="text-[10px] leading-snug text-[var(--text-secondary)]">{p.materialForceSingleChannelHint}</div>
      <div className="space-y-1 pt-2">
        <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialAlphaTestLabel}</label>
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={1} step={0.01} value={selectedMaterialAlphaTestThreshold} onPointerDown={onAlphaTestDragStart} onChange={(e) => onAlphaTestPreviewChange(Number(e.target.value))} onPointerUp={(e) => onAlphaTestCommit(Number((e.target as HTMLInputElement).value))} aria-label={p.materialAlphaTestLabel} className="w-full" />
          <div className="w-12 text-right text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{selectedMaterialAlphaTestThreshold.toFixed(2)}</div>
        </div>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 pt-2">
        <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialDepthTestLabel}</span>
        <input type="checkbox" checked={selectedMaterialDepthTest} onChange={(e) => onDepthTestChange(e.target.checked)} className="h-4 w-4" />
      </label>
      <label className="flex cursor-pointer items-center justify-between gap-3 pt-2">
        <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialDepthWriteLabel}</span>
        <input type="checkbox" checked={selectedMaterialDepthWrite} onChange={(e) => onDepthWriteChange(e.target.checked)} className="h-4 w-4" />
      </label>
      <div className="space-y-1 pt-2">
        {/* 顶点色：开启后会对网格写入/更新 color attribute */}
        <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialVertexColorLabel}</label>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialVertexColorEnabledLabel}</span>
          <input type="checkbox" checked={selectedVertexColorsEnabled} onChange={(e) => onVertexColorsEnabledChange(e.target.checked)} className="h-4 w-4" />
        </label>
        {selectedVertexColorsEnabled ? (
          <div className="pt-1">
            <ColorPicker value={selectedVertexColor} ariaLabel={p.materialVertexColorLabel} showValue={true} onChange={onVertexColorChange} />
          </div>
        ) : null}
      </div>
    </>
  );
}
