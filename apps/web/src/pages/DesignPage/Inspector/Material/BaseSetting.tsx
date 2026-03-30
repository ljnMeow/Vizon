import { useEffect, useMemo, useState } from 'react';

import { ColorPicker } from '../../../../components/ColorPicker';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';

const materialTypeOrder = [
  'MeshBasicMaterial',
  'MeshDepthMaterial',
  'MeshNormalMaterial',
  'MeshMatcapMaterial',
  'MeshLambertMaterial',
  'MeshPhongMaterial',
  'MeshToonMaterial',
  'MeshStandardMaterial',
  'MeshPhysicalMaterial',
  'PointsMaterial',
  'LineBasicMaterial',
  'ShadowMaterial',
  'ShaderMaterial'
] as const;

type MaterialTypeKey = (typeof materialTypeOrder)[number];

const materialTypeSet = new Set<MaterialTypeKey>(materialTypeOrder);

const materialBlendingOrder = [
  'NoBlending',
  'NormalBlending',
  'AdditiveBlending',
  'SubtractiveBlending',
  'MultiplyBlending'
] as const;

type MaterialBlendingKey = (typeof materialBlendingOrder)[number];

const blendingKeyToValue: Record<MaterialBlendingKey, number> = {
  // three.js: NoBlending=0, NormalBlending=1, AdditiveBlending=2, SubtractiveBlending=3, MultiplyBlending=4, CustomBlending=5
  NoBlending: 0,
  NormalBlending: 1,
  AdditiveBlending: 2,
  SubtractiveBlending: 3,
  MultiplyBlending: 4,
};

const valueToBlendingKey = new Map<number, MaterialBlendingKey>(
  Object.entries(blendingKeyToValue).map(([k, v]) => [v, k as MaterialBlendingKey])
);

const materialSideOrder = ['FrontSide', 'BackSide', 'DoubleSide'] as const;
type MaterialSideKey = (typeof materialSideOrder)[number];

const materialSideKeyToValue: Record<MaterialSideKey, number> = {
  // three.js: FrontSide=0, BackSide=1, DoubleSide=2
  FrontSide: 0,
  BackSide: 1,
  DoubleSide: 2,
};

function getFirstMeshMaterial(root: any): any | null {
  if (!root?.traverse) return null;
  let first: any = null;
  root.traverse((obj: any) => {
    if (first) return;
    if (!obj?.isMesh) return;
    if (!obj.material) return;
    if (Array.isArray(obj.material)) first = obj.material.find(Boolean) ?? null;
    else first = obj.material;
  });
  return first;
}

function getMeshMaterials(root: any): any[] {
  const materials: any[] = [];
  if (!root?.traverse) return materials;

  root.traverse((child: any) => {
    const material = child?.material;
    if (!material) return;

    const list = Array.isArray(material) ? material : [material];
    for (const m of list) {
      if (!m) continue;
      // 只收集具备 blending 属性的材质，避免 helper/materials 等不可控类型污染。
      if (typeof (m as any).blending !== 'number') continue;
      materials.push(m);
    }
  });

  return materials;
}

function getAllMeshMaterials(root: any): any[] {
  const materials: any[] = [];
  if (!root?.traverse) return materials;

  root.traverse((child: any) => {
    const material = child?.material;
    if (!material) return;

    const list = Array.isArray(material) ? material : [material];
    for (const m of list) {
      if (!m) continue;
      materials.push(m);
    }
  });

  return materials;
}

function getBlendingKey(material: any): MaterialBlendingKey | null {
  if (!material) return null;
  const v = (material as any).blending;
  if (typeof v !== 'number') return null;
  return valueToBlendingKey.get(v) ?? null;
}

function getSideKey(material: any): MaterialSideKey | null {
  if (!material) return null;
  const v = (material as any).side;
  if (typeof v !== 'number') return null;

  for (const key of materialSideOrder) {
    if (materialSideKeyToValue[key] === v) return key;
  }
  return null;
}

function normalizeHexColor(input: string): string {
  const raw = input?.trim?.() ?? '';
  if (!raw) return '#000000';

  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (withHash.length === 7) return withHash;

  // #RGB -> #RRGGBB
  if (withHash.length === 4) {
    const r = withHash[1];
    const g = withHash[2];
    const b = withHash[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  // 兜底：尽量截取成 #RRGGBB
  return `#${withHash.replace('#', '').slice(0, 6)}`.toLowerCase();
}

function getMaterialColorValue(material: any): string | null {
  const c = material?.color;
  if (!c) return null;

  if (typeof c.getHexString === 'function') {
    return normalizeHexColor(`#${c.getHexString()}`);
  }

  if (typeof c.getHex === 'function') {
    const hex = c.getHex();
    return `#${hex.toString(16).padStart(6, '0')}`;
  }

  if (typeof c === 'number') {
    return `#${c.toString(16).padStart(6, '0')}`;
  }

  if (typeof c === 'string') {
    return normalizeHexColor(c);
  }

  return null;
}

function hexToRgbNormalized(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex);
  const hexStr = normalized.replace('#', '');
  const r = Number.parseInt(hexStr.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hexStr.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hexStr.slice(4, 6), 16) / 255;
  return { r, g, b };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function getFirstMeshGeometry(root: any): any | null {
  if (!root?.traverse) return null;
  let first: any = null;
  root.traverse((obj: any) => {
    if (first) return;
    if (!obj?.isMesh) return;
    if (!obj?.geometry) return;
    first = obj.geometry;
  });
  return first;
}

function getAllMeshes(root: any): any[] {
  const meshes: any[] = [];
  if (!root?.traverse) return meshes;
  root.traverse((obj: any) => {
    if (!obj?.isMesh) return;
    if (!obj?.geometry) return;
    meshes.push(obj);
  });
  return meshes;
}

function getVertexColorValueFromGeometry(geometry: any): string | null {
  const attr = geometry?.attributes?.color;
  const array = attr?.array;
  if (!array || array.length < 3) return null;

  let r = array[0] as number;
  let g = array[1] as number;
  let b = array[2] as number;

  // 通常 Float32Array 为 0..1，Uint8Array 为 0..255；用范围做简单判断。
  const isNormalized = r <= 1 && g <= 1 && b <= 1;
  if (isNormalized) {
    r = r * 255;
    g = g * 255;
    b = b * 255;
  }

  const toHex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toLowerCase();
}

export function MaterialBaseSetting() {
  const { editor } = useSceneSettings();
  const { locale } = useLocale();
  const t = appMessages[locale].designPage.inspector;

  const materialLabels = t.propertiesSettings.materialTypeOptions;
  const materialColorLabel = t.propertiesSettings.materialColorLabel;
  const materialOpacityLabel = t.propertiesSettings.materialOpacityLabel ?? '透明度';
  const materialForceSingleChannelLabel = (t.propertiesSettings as any).materialForceSingleChannelLabel ?? '强制单通道';
  const materialAlphaTestLabel = (t.propertiesSettings as any).materialAlphaTestLabel ?? 'α 测试阀值';
  const materialTransparentEnabledLabel = (t.propertiesSettings as any).materialTransparentEnabledLabel ?? '透明性';
  const materialWireframeLabel = t.propertiesSettings.materialWireframeLabel ?? '线框';
  const materialDepthTestLabel = (t.propertiesSettings as any).materialDepthTestLabel ?? '深度测试';
  const materialDepthWriteLabel = (t.propertiesSettings as any).materialDepthWriteLabel ?? '深度写入';
  // 兼容历史类型：如果未在 i18n 文案里补齐字段，则使用默认值回退。
  const materialVertexColorLabel = (t.propertiesSettings as any).materialVertexColorLabel ?? '顶点颜色';
  const materialVertexColorEnabledLabel = (t.propertiesSettings as any).materialVertexColorEnabledLabel ?? '启用顶点颜色';
  const materialSideLabel = t.propertiesSettings.materialSideLabel;
  const materialSideOptions = t.propertiesSettings.materialSideOptions;
  const blendingLabel = t.propertiesSettings.materialBlendingLabel;
  const blendingOptions = t.propertiesSettings.materialBlendingOptions;
  const blendingDescriptions = t.propertiesSettings.materialBlendingDescriptions;

  const [selectedMaterialType, setSelectedMaterialType] = useState<MaterialTypeKey | null>(null);
  const [selectedMaterialSide, setSelectedMaterialSide] = useState<MaterialSideKey | null>(null);
  const [selectedMaterialColor, setSelectedMaterialColor] = useState<string | null>(null);
  const [selectedMaterialOpacity, setSelectedMaterialOpacity] = useState<number>(1);
  const [selectedMaterialTransparentEnabled, setSelectedMaterialTransparentEnabled] = useState<boolean>(false);
  const [selectedMaterialAlphaTestThreshold, setSelectedMaterialAlphaTestThreshold] = useState<number>(0);
  const [selectedMaterialForceSingleChannelEnabled, setSelectedMaterialForceSingleChannelEnabled] = useState<boolean>(false);
  const [selectedMaterialWireframe, setSelectedMaterialWireframe] = useState<boolean>(false);
  const [selectedMaterialDepthTest, setSelectedMaterialDepthTest] = useState<boolean>(true);
  const [selectedMaterialDepthWrite, setSelectedMaterialDepthWrite] = useState<boolean>(true);
  const [selectedVertexColorsEnabled, setSelectedVertexColorsEnabled] = useState<boolean>(false);
  const [selectedVertexColor, setSelectedVertexColor] = useState<string>('#ffffff');
  const [selectedBlendingMode, setSelectedBlendingMode] = useState<MaterialBlendingKey | null>(null);

  useEffect(() => {
    if (!editor) {
      setSelectedMaterialType(null);
      setSelectedMaterialSide(null);
      setSelectedMaterialColor(null);
      setSelectedMaterialOpacity(1);
      setSelectedMaterialTransparentEnabled(false);
      setSelectedMaterialAlphaTestThreshold(0);
      setSelectedMaterialForceSingleChannelEnabled(false);
      setSelectedMaterialWireframe(false);
      setSelectedMaterialDepthTest(true);
      setSelectedMaterialDepthWrite(true);
      setSelectedVertexColorsEnabled(false);
      setSelectedVertexColor('#ffffff');
      setSelectedBlendingMode(null);
      return;
    }

    const syncFromObject = (object: any) => {
      const mat = getFirstMeshMaterial(object);
      if (!mat) {
        setSelectedMaterialType(null);
        setSelectedMaterialSide(null);
        setSelectedMaterialColor(null);
        setSelectedMaterialOpacity(1);
        setSelectedMaterialTransparentEnabled(false);
        setSelectedMaterialAlphaTestThreshold(0);
        setSelectedMaterialForceSingleChannelEnabled(false);
        setSelectedMaterialWireframe(false);
        setSelectedMaterialDepthTest(true);
        setSelectedMaterialDepthWrite(true);
        setSelectedVertexColorsEnabled(false);
        setSelectedVertexColor('#ffffff');
        setSelectedBlendingMode(null);
        return;
      }

      const rawType = String(mat?.type ?? 'MeshBasicMaterial');
      if (!materialTypeSet.has(rawType as MaterialTypeKey)) {
        setSelectedMaterialType(null);
        setSelectedMaterialSide(null);
        setSelectedMaterialColor(null);
        setSelectedMaterialOpacity(1);
        setSelectedMaterialTransparentEnabled(false);
        setSelectedMaterialAlphaTestThreshold(0);
        setSelectedMaterialForceSingleChannelEnabled(false);
        setSelectedMaterialWireframe(false);
        setSelectedMaterialDepthTest(true);
        setSelectedMaterialDepthWrite(true);
        setSelectedVertexColorsEnabled(false);
        setSelectedVertexColor('#ffffff');
        setSelectedBlendingMode(null);
        return;
      }

      setSelectedMaterialType(rawType as MaterialTypeKey);
      // 如果材质上未显式暴露 side（极少数情况），仍默认按 FrontSide 展示，方便用户调整。
      setSelectedMaterialSide(getSideKey(mat) ?? 'FrontSide');
      setSelectedMaterialColor(getMaterialColorValue(mat));

      const geo = getFirstMeshGeometry(object);
      const enabled = Boolean((mat as any).vertexColors);
      setSelectedVertexColorsEnabled(enabled);
      setSelectedVertexColor(getVertexColorValueFromGeometry(geo) ?? '#ffffff');

      const nextBlend = getBlendingKey(mat);
      setSelectedBlendingMode(nextBlend);

      const rawOpacity = (mat as any)?.opacity;
      if (typeof rawOpacity === 'number' && Number.isFinite(rawOpacity)) {
        setSelectedMaterialOpacity(clamp01(rawOpacity));
      } else {
        setSelectedMaterialOpacity(1);
      }

      const rawTransparent = (mat as any)?.transparent;
      setSelectedMaterialTransparentEnabled(typeof rawTransparent === 'boolean' ? rawTransparent : Boolean((mat as any)?.opacity < 1));

      const rawWireframe = (mat as any)?.wireframe;
      setSelectedMaterialWireframe(typeof rawWireframe === 'boolean' ? rawWireframe : false);

      const rawAlphaTest = (mat as any)?.alphaTest;
      if (typeof rawAlphaTest === 'number' && Number.isFinite(rawAlphaTest)) {
        setSelectedMaterialAlphaTestThreshold(clamp01(rawAlphaTest));
      } else {
        setSelectedMaterialAlphaTestThreshold(0);
      }

      const rawAlphaToCoverage = (mat as any)?.alphaToCoverage;
      setSelectedMaterialForceSingleChannelEnabled(typeof rawAlphaToCoverage === 'boolean' ? rawAlphaToCoverage : false);

      const rawDepthTest = (mat as any)?.depthTest;
      setSelectedMaterialDepthTest(typeof rawDepthTest === 'boolean' ? rawDepthTest : true);

      const rawDepthWrite = (mat as any)?.depthWrite;
      setSelectedMaterialDepthWrite(typeof rawDepthWrite === 'boolean' ? rawDepthWrite : true);

      // 如果当前就是 SubtractiveBlending，同时 premultipliedAlpha=false，
      // 会触发 three.js 的警告；这里在同步时也做一次兜底修正。
      if (nextBlend === 'SubtractiveBlending' && typeof (mat as any).premultipliedAlpha === 'boolean') {
        if ((mat as any).premultipliedAlpha !== true) {
          (mat as any).premultipliedAlpha = true;
          (mat as any).needsUpdate = true;
        }
      }
    };

    // 首次同步 + 后续跟随 selection 变化
    syncFromObject(editor.getSelected());

    return editor.on('select', ({ object }) => {
      syncFromObject(object);
    });
  }, [editor]);

  const options = useMemo(
    () => materialTypeOrder.map((k) => ({ key: k, label: materialLabels[k] })),
    [materialLabels]
  );

  const sideOptionsList = useMemo(
    () => materialSideOrder.map((k) => ({ key: k, label: materialSideOptions[k] })),
    [materialSideOptions]
  );

  const blendingOptionsList = useMemo(
    () => materialBlendingOrder.map((k) => ({ key: k, label: blendingOptions[k] })),
    [blendingOptions]
  );

  return (
    <div className="space-y-3 select-none">
      {!selectedMaterialType ? (
        <div className="text-xs text-[var(--text-secondary)]">{t.placeholders.materials}</div>
      ) : (
        <div className="space-y-1">
          <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
            {t.propertiesSettings.materialTypeLabel}
          </label>
          <select
            value={selectedMaterialType}
            onChange={(e) => setSelectedMaterialType(e.target.value as MaterialTypeKey)}
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
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                {materialSideLabel}
              </label>
              <select
                value={selectedMaterialSide}
                onChange={(e) => {
                  const next = e.target.value as MaterialSideKey;
                  setSelectedMaterialSide(next);

                  if (!editor) return;
                  const root = editor.getSelected();
                  if (!root) return;

                  const mats = getAllMeshMaterials(root);
                  if (mats.length === 0) return;

                  const nextValue = materialSideKeyToValue[next];
                  for (const m of mats) {
                    (m as any).side = nextValue;
                    (m as any).needsUpdate = true;
                  }
                }}
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
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                {blendingLabel}
              </label>
              <select
                value={selectedBlendingMode}
                onChange={(e) => {
                  const next = e.target.value as MaterialBlendingKey;
                  setSelectedBlendingMode(next);

                  if (!editor) return;
                  const root = editor.getSelected();
                  if (!root) return;

                  const mats = getMeshMaterials(root);
                  if (mats.length === 0) return;

                  const nextValue = blendingKeyToValue[next];
                  for (const m of mats) {
                    (m as any).blending = nextValue;
                    // three.js 约束：SubtractiveBlending 需要 premultipliedAlpha = true
                    if (typeof (m as any).premultipliedAlpha === 'boolean') {
                      (m as any).premultipliedAlpha = next === 'SubtractiveBlending';
                    }
                    (m as any).needsUpdate = true;
                  }
                }}
                className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              >
                {blendingOptionsList.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {blendingDescriptions[selectedBlendingMode] ? (
                <div className="text-[10px] leading-snug text-[var(--text-secondary)]">
                  {blendingDescriptions[selectedBlendingMode]}
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedMaterialColor ? (
            <div className="space-y-1 pt-2">
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                {materialColorLabel}
              </label>
              <ColorPicker
                value={selectedMaterialColor}
                ariaLabel={materialColorLabel}
                showValue={true}
                onChange={(nextColor) => {
                  setSelectedMaterialColor(nextColor);

                  if (!editor) return;
                  const root = editor.getSelected();
                  if (!root) return;

                  const mats = getAllMeshMaterials(root);
                  if (mats.length === 0) return;

                  for (const m of mats) {
                    const c = (m as any).color;
                    if (!c) continue;
                    if (typeof c.set === 'function') {
                      c.set(nextColor);
                      (m as any).needsUpdate = true;
                    } else {
                      (m as any).color = nextColor;
                      (m as any).needsUpdate = true;
                    }
                  }
                }}
              />
            </div>
          ) : null}

          <div className="space-y-1 pt-2">
            <label className="flex cursor-pointer items-center justify-between gap-3 pt-2">
              <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                {materialTransparentEnabledLabel}
              </span>
              <input
                type="checkbox"
                checked={selectedMaterialTransparentEnabled}
                onChange={(e) => {
                  const nextEnabled = e.target.checked;
                  setSelectedMaterialTransparentEnabled(nextEnabled);

                  if (!editor) return;
                  const root = editor.getSelected();
                  if (!root) return;

                  const mats = getAllMeshMaterials(root);
                  if (mats.length === 0) return;

                  // 透明性开关关闭时：强制回到完全不透明，避免用户误以为透明滑块在生效。
                  if (!nextEnabled) {
                    const nextOpacity = 1;
                    setSelectedMaterialOpacity(nextOpacity);

                    for (const m of mats) {
                      if (typeof (m as any).opacity === 'number') (m as any).opacity = nextOpacity;
                      (m as any).transparent = false;
                      (m as any).needsUpdate = true;
                    }
                    return;
                  }

                  // 透明性开关开启时：根据当前透明度值决定是否开启混合（透明需要透明排序/混合）。
                  const appliedOpacity = selectedMaterialOpacity;
                  for (const m of mats) {
                    if (typeof (m as any).opacity === 'number') (m as any).opacity = appliedOpacity;
                    (m as any).transparent = appliedOpacity < 1;
                    (m as any).needsUpdate = true;
                  }
                }}
                className="h-4 w-4"
              />
            </label>

            {selectedMaterialTransparentEnabled ?
              <>
                <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                  {materialOpacityLabel}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={selectedMaterialOpacity}
                    disabled={!selectedMaterialTransparentEnabled}
                    onChange={(e) => {
                      const next = clamp01(Number(e.target.value));
                      setSelectedMaterialOpacity(next);

                      if (!editor) return;
                      const root = editor.getSelected();
                      if (!root) return;

                      const mats = getAllMeshMaterials(root);
                      if (mats.length === 0) return;

                      for (const m of mats) {
                        if (typeof (m as any).opacity !== 'number') continue;
                        (m as any).opacity = next;

                        // three.js：透明度生效需要 transparent=true
                        (m as any).transparent = selectedMaterialTransparentEnabled && next < 1;
                        (m as any).needsUpdate = true;
                      }
                    }}
                    aria-label={materialOpacityLabel}
                    className="w-full"
                  />
                  <div className="w-12 text-right text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                    {selectedMaterialOpacity.toFixed(2)}
                  </div>
                </div>
              </> : null}
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 pt-2">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{materialWireframeLabel}</span>
            <input
              type="checkbox"
              checked={selectedMaterialWireframe}
              onChange={(e) => {
                const next = e.target.checked;
                setSelectedMaterialWireframe(next);

                if (!editor) return;
                const root = editor.getSelected();
                if (!root) return;

                const mats = getAllMeshMaterials(root);
                if (mats.length === 0) return;

                for (const m of mats) {
                  if (typeof (m as any).wireframe !== 'boolean') continue;
                  (m as any).wireframe = next;
                  (m as any).needsUpdate = true;
                }
              }}
              className="h-4 w-4"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3 pt-2">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{materialForceSingleChannelLabel}</span>
            <input
              type="checkbox"
              checked={selectedMaterialForceSingleChannelEnabled}
              onChange={(e) => {
                const nextEnabled = e.target.checked;
                setSelectedMaterialForceSingleChannelEnabled(nextEnabled);

                if (!editor) return;
                const root = editor.getSelected();
                if (!root) return;

                const mats = getAllMeshMaterials(root);
                if (mats.length === 0) return;

                for (const m of mats) {
                  (m as any).alphaToCoverage = nextEnabled;
                  (m as any).needsUpdate = true;
                }
              }}
              className="h-4 w-4"
            />
          </label>

          <div className="space-y-1 pt-2">
            <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
              {materialAlphaTestLabel}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={selectedMaterialAlphaTestThreshold}
                onChange={(e) => {
                  const next = clamp01(Number(e.target.value));
                  setSelectedMaterialAlphaTestThreshold(next);

                  if (!editor) return;
                  const root = editor.getSelected();
                  if (!root) return;

                  const mats = getAllMeshMaterials(root);
                  if (mats.length === 0) return;

                  for (const m of mats) {
                    if (typeof (m as any).alphaTest !== 'number') continue;
                    (m as any).alphaTest = next;
                    (m as any).needsUpdate = true;
                  }
                }}
                aria-label={materialAlphaTestLabel}
                className="w-full"
              />
              <div className="w-12 text-right text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                {selectedMaterialAlphaTestThreshold.toFixed(2)}
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 pt-2">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{materialDepthTestLabel}</span>
            <input
              type="checkbox"
              checked={selectedMaterialDepthTest}
              onChange={(e) => {
                const next = e.target.checked;
                setSelectedMaterialDepthTest(next);

                if (!editor) return;
                const root = editor.getSelected();
                if (!root) return;

                const mats = getAllMeshMaterials(root);
                if (mats.length === 0) return;

                for (const m of mats) {
                  if (typeof (m as any).depthTest !== 'boolean') continue;
                  (m as any).depthTest = next;
                  (m as any).needsUpdate = true;
                }
              }}
              className="h-4 w-4"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3 pt-2">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{materialDepthWriteLabel}</span>
            <input
              type="checkbox"
              checked={selectedMaterialDepthWrite}
              onChange={(e) => {
                const next = e.target.checked;
                setSelectedMaterialDepthWrite(next);

                if (!editor) return;
                const root = editor.getSelected();
                if (!root) return;

                const mats = getAllMeshMaterials(root);
                if (mats.length === 0) return;

                for (const m of mats) {
                  if (typeof (m as any).depthWrite !== 'boolean') continue;
                  (m as any).depthWrite = next;
                  (m as any).needsUpdate = true;
                }
              }}
              className="h-4 w-4"
            />
          </label>

          <div className="space-y-1 pt-2">
            <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
              {materialVertexColorLabel}
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
                {materialVertexColorEnabledLabel}
              </span>
              <input
                type="checkbox"
                checked={selectedVertexColorsEnabled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setSelectedVertexColorsEnabled(next);

                  if (!editor) return;
                  const root = editor.getSelected();
                  if (!root) return;

                  const mats = getAllMeshMaterials(root);
                  for (const m of mats) {
                    (m as any).vertexColors = next;
                    (m as any).needsUpdate = true;
                  }

                  if (!next) return;

                  const rgb = hexToRgbNormalized(selectedVertexColor);
                  const meshes = getAllMeshes(root);
                  for (const mesh of meshes) {
                    const geometry = mesh.geometry;
                    if (!geometry?.attributes?.position) continue;

                    const cloned = typeof geometry.clone === 'function' ? geometry.clone() : geometry;
                    const positionAttr = cloned.attributes.position;
                    const vertexCount = positionAttr.count;
                    const colors = new Float32Array(vertexCount * 3);

                    for (let i = 0; i < vertexCount; i++) {
                      const idx = i * 3;
                      colors[idx] = rgb.r;
                      colors[idx + 1] = rgb.g;
                      colors[idx + 2] = rgb.b;
                    }

                    // 为 geometry 注入顶点颜色属性（name: 'color'）
                    const positionAttrForCtor = cloned.attributes?.position;
                    const BufferAttributeCtor = positionAttrForCtor?.constructor;
                    if (typeof BufferAttributeCtor !== 'function') continue;
                    cloned.setAttribute('color', new BufferAttributeCtor(colors, 3));
                    if (cloned.attributes?.color) (cloned.attributes.color as any).needsUpdate = true;
                    (cloned as any).colorsNeedUpdate = true;
                    mesh.geometry = cloned;
                  }
                }}
                className="h-4 w-4"
              />
            </label>

            {selectedVertexColorsEnabled ? (
              <div className="pt-1">
                <ColorPicker
                  value={selectedVertexColor}
                  ariaLabel={materialVertexColorLabel}
                  showValue={true}
                  onChange={(nextColor) => {
                    setSelectedVertexColor(nextColor);
                    if (!editor) return;
                    const root = editor.getSelected();
                    if (!root) return;

                    const mats = getAllMeshMaterials(root);
                    for (const m of mats) {
                      (m as any).vertexColors = true;
                      (m as any).needsUpdate = true;
                    }

                    const rgb = hexToRgbNormalized(nextColor);
                    const meshes = getAllMeshes(root);
                    for (const mesh of meshes) {
                      const geometry = mesh.geometry;
                      if (!geometry?.attributes?.position) continue;

                      const cloned = typeof geometry.clone === 'function' ? geometry.clone() : geometry;
                      const positionAttr = cloned.attributes.position;
                      const vertexCount = positionAttr.count;
                      const colors = new Float32Array(vertexCount * 3);

                      for (let i = 0; i < vertexCount; i++) {
                        const idx = i * 3;
                        colors[idx] = rgb.r;
                        colors[idx + 1] = rgb.g;
                        colors[idx + 2] = rgb.b;
                      }

                      const positionAttrForCtor = cloned.attributes?.position;
                      const BufferAttributeCtor = positionAttrForCtor?.constructor;
                      if (typeof BufferAttributeCtor !== 'function') continue;
                      cloned.setAttribute('color', new BufferAttributeCtor(colors, 3));
                      if (cloned.attributes?.color) (cloned.attributes.color as any).needsUpdate = true;
                      (cloned as any).colorsNeedUpdate = true;
                      mesh.geometry = cloned;
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

