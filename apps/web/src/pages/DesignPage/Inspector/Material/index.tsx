import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { switchMaterialTypeOnObject } from 'vizon-3d-core';

import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages, type AppMessages } from '../../../../i18n/messages';
import { encodeHistoryI18nName } from '../../../../utils/historyI18n';
import { WEB_USER_DATA_KEYS } from '../../../../utils/keys';
import { MaterialMainControlsSection } from './MaterialMainControlsSection';
import { MaterialTextureMapsSection } from './MaterialTextureMapsSection';
import {
  allTextureFieldKeys,
  blendingKeyToValue,
  materialBlendingOrder,
  materialSideKeyToValue,
  materialSideOrder,
  materialTypeOrder,
  materialTypeSet,
  textureSupportByMaterialType,
  type MaterialBlendingKey,
  type MaterialSideKey,
  type MaterialTypeKey,
  type TextureFieldKey,
} from './materialConstants';
import {
  clamp01,
  getAllMeshMaterials,
  getAllMeshes,
  getBlendingKey,
  getFirstMeshGeometry,
  getFirstMeshMaterial,
  getMaterialColorValue,
  getMeshMaterials,
  getSideKey,
  getVertexColorValueFromGeometry,
  hexToRgbNormalized,
} from './materialUtils';
import type { TextureMapItemLabels } from './TextureMapItem';

/**
 * 材质设置面板。
 * 订阅 editor 的 select 事件，从选中对象的第一个 Mesh 材质同步 UI 状态，
 * 并通过 historyOperation 提交可撤销的材质变更。
 */
export function MaterialSettings() {
  const TEXTURE_EFFECT_DISABLED_KEY = WEB_USER_DATA_KEYS.MATERIAL.TEXTURE_EFFECT_DISABLED;
  // 编辑器实例：所有材质读写都通过当前选中对象进行
  const { editor } = useSceneSettings();
  // 当前语言环境：用于读取 i18n 文案
  const { locale } = useLocale();
  const t = appMessages[locale].designPage.inspector;
  // p = propertiesSettings 的别名，避免后续频繁写长路径
  const p: AppMessages['designPage']['inspector']['propertiesSettings'] = t.propertiesSettings;
  const pZh = appMessages['zh-CN'].designPage.inspector.propertiesSettings;
  const pEn = appMessages['en-US'].designPage.inspector.propertiesSettings;

  // 材质类型下拉选项文案
  const materialLabels = p.materialTypeOptions;
  // 贴图调试开关文案（单项启停）
  const materialTextureDebugDisableOneLabel = p.materialTextureDebugDisableOneLabel;
  // TextureMapItem 通用按钮/空态文案
  const textureMapLabels: TextureMapItemLabels = {
    upload: p.materialTextureUpload,
    clear: p.materialTextureClear,
    empty: p.materialTextureEmpty,
    textureFallback: p.materialTextureNameFallback,
  };
  // 贴图字段名文案（map/envMap/normalMap...）
  const tf = p.materialTextureFieldLabels;
  // 材质面剔除文案
  const materialSideOptions = p.materialSideOptions;
  // 混合模式文案
  const blendingOptions = p.materialBlendingOptions;
  // 混合模式说明文案（下拉框下方解释）
  const blendingDescriptions = p.materialBlendingDescriptions;
  const historyName = (zhName: string, enName: string) =>
    encodeHistoryI18nName({ 'zh-CN': zhName, 'en-US': enName });
  const boolText = (v: boolean) => (v ? { zh: '是', en: 'true' } : { zh: '否', en: 'false' });

  // 面板状态与 three 材质数据保持“受控同步”
  // 当前材质类型（用于主控区渲染与贴图支持判断）
  const [selectedMaterialType, setSelectedMaterialType] = useState<MaterialTypeKey | null>(null);
  // side（Front/Back/Double）
  const [selectedMaterialSide, setSelectedMaterialSide] = useState<MaterialSideKey | null>(null);
  // base color
  const [selectedMaterialColor, setSelectedMaterialColor] = useState<string | null>(null);
  // opacity（0~1）
  const [selectedMaterialOpacity, setSelectedMaterialOpacity] = useState<number>(1);
  // 是否开启 transparent
  const [selectedMaterialTransparentEnabled, setSelectedMaterialTransparentEnabled] = useState<boolean>(false);
  // alphaTest 阈值（0~1）
  const [selectedMaterialAlphaTestThreshold, setSelectedMaterialAlphaTestThreshold] = useState<number>(0);
  // alphaToCoverage（UI 命名为 single channel）
  const [selectedMaterialForceSingleChannelEnabled, setSelectedMaterialForceSingleChannelEnabled] = useState<boolean>(false);
  // 线框模式
  const [selectedMaterialWireframe, setSelectedMaterialWireframe] = useState<boolean>(false);
  // 深度测试
  const [selectedMaterialDepthTest, setSelectedMaterialDepthTest] = useState<boolean>(true);
  // 深度写入
  const [selectedMaterialDepthWrite, setSelectedMaterialDepthWrite] = useState<boolean>(true);
  // 顶点色总开关
  const [selectedVertexColorsEnabled, setSelectedVertexColorsEnabled] = useState<boolean>(false);
  // 顶点色面板当前颜色
  const [selectedVertexColor, setSelectedVertexColor] = useState<string>('#ffffff');
  // blending key
  const [selectedBlendingMode, setSelectedBlendingMode] = useState<MaterialBlendingKey | null>(null);
  // envMapIntensity
  const [selectedEnvMapIntensity, setSelectedEnvMapIntensity] = useState<number>(1);
  // aoMapIntensity
  const [selectedAoMapIntensity, setSelectedAoMapIntensity] = useState<number>(1);
  // normalScale（x/y）
  const [selectedNormalScale, setSelectedNormalScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  // clearcoatNormalScale（x/y）
  const [selectedClearcoatNormalScale, setSelectedClearcoatNormalScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  const textureDebugCacheRef = useRef<Record<string, Partial<Record<TextureFieldKey, any>>>>({});
  const activeTextureDebugMaterialIdRef = useRef<string | null>(null);
  const materialSliderBeforeRef = useRef<Record<string, Array<{ material: any; value: any }> | undefined>>({});
  const opacityDragStartValueRef = useRef<number | null>(null);
  const alphaTestDragStartValueRef = useRef<number | null>(null);

  /**
   * 从选中对象同步所有 UI 状态。
   * @param object 当前 editor 选中的对象（可能为空、可能不是 mesh）
   */
  const syncFromObject = useCallback((object: any) => {
      const mat = getFirstMeshMaterial(object);
      const matId = (mat as any)?.uuid ?? null;
      // 仅在“切到不同材质对象”时清理缓存；取消选择再选回同一对象不应重置贴图状态。
      if (matId && activeTextureDebugMaterialIdRef.current && activeTextureDebugMaterialIdRef.current !== matId) {
        textureDebugCacheRef.current = {};
      }
      if (matId) {
        activeTextureDebugMaterialIdRef.current = matId;
      }
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
        setSelectedEnvMapIntensity(1);
        setSelectedAoMapIntensity(1);
      setSelectedNormalScale({ x: 1, y: 1 });
      setSelectedClearcoatNormalScale({ x: 1, y: 1 });
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
        setSelectedEnvMapIntensity(1);
        setSelectedAoMapIntensity(1);
        setSelectedNormalScale({ x: 1, y: 1 });
        setSelectedClearcoatNormalScale({ x: 1, y: 1 });
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
      // 只跟随 three 材质自身的 transparent 字段，不再用 opacity 反推，以避免重新选中后开关被“自动关掉”
      setSelectedMaterialTransparentEnabled(Boolean(rawTransparent));

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

      const rawEnvIntensity = (mat as any)?.envMapIntensity;
      setSelectedEnvMapIntensity(typeof rawEnvIntensity === 'number' && Number.isFinite(rawEnvIntensity) ? rawEnvIntensity : 1);

      const rawAoIntensity = (mat as any)?.aoMapIntensity;
      setSelectedAoMapIntensity(typeof rawAoIntensity === 'number' && Number.isFinite(rawAoIntensity) ? rawAoIntensity : 1);

      const rawNormalScale = (mat as any)?.normalScale;
      if (rawNormalScale && typeof rawNormalScale?.x === 'number' && typeof rawNormalScale?.y === 'number') {
        setSelectedNormalScale({
          x: Number.isFinite(rawNormalScale.x) ? rawNormalScale.x : 1,
          y: Number.isFinite(rawNormalScale.y) ? rawNormalScale.y : 1,
        });
      } else {
        setSelectedNormalScale({ x: 1, y: 1 });
      }

      const rawCcNormalScale = (mat as any)?.clearcoatNormalScale;
      if (rawCcNormalScale && typeof rawCcNormalScale?.x === 'number' && typeof rawCcNormalScale?.y === 'number') {
        setSelectedClearcoatNormalScale({
          x: Number.isFinite(rawCcNormalScale.x) ? rawCcNormalScale.x : 1,
          y: Number.isFinite(rawCcNormalScale.y) ? rawCcNormalScale.y : 1,
        });
      } else {
        setSelectedClearcoatNormalScale({ x: 1, y: 1 });
      }

      // 如果当前就是 SubtractiveBlending，同时 premultipliedAlpha=false，
      // 会触发 three.js 的警告；这里在同步时也做一次兜底修正。
      if (nextBlend === 'SubtractiveBlending' && typeof (mat as any).premultipliedAlpha === 'boolean') {
        if ((mat as any).premultipliedAlpha !== true) {
          (mat as any).premultipliedAlpha = true;
          (mat as any).needsUpdate = true;
        }
      }
    }, []);

  useEffect(() => {
    if (!editor) {
      syncFromObject(null);
      return;
    }

    // 首次同步 + 后续跟随 selection 变化
    syncFromObject(editor.getSelected());

    return editor.on('select', ({ object }) => {
      syncFromObject(object);
    });
  }, [editor, syncFromObject]);

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

  const textureSupport = selectedMaterialType ? textureSupportByMaterialType[selectedMaterialType] : null;

  const hasAnyMaterialTextureField = useMemo(() => {
    if (!textureSupport) return false;
    return Object.values(textureSupport).some((v) => v === true);
  }, [textureSupport]);

  const hasTextureGroupBasic = useMemo(
    () => Boolean(textureSupport?.map || textureSupport?.envMap || textureSupport?.alphaMap),
    [textureSupport]
  );
  const hasTextureGroupLighting = useMemo(
    () => Boolean(textureSupport?.lightMap || textureSupport?.aoMap || textureSupport?.emissiveMap),
    [textureSupport]
  );
  const hasTextureGroupNormal = useMemo(
    () => Boolean(textureSupport?.bumpMap || textureSupport?.normalMap || textureSupport?.displacementMap),
    [textureSupport]
  );
  const hasTextureGroupPbr = useMemo(
    () => Boolean(textureSupport?.roughnessMap || textureSupport?.metalnessMap),
    [textureSupport]
  );
  const hasTextureGroupAdvanced = useMemo(() => {
    if (selectedMaterialType !== 'MeshPhysicalMaterial' || !textureSupport) return false;
    return Boolean(
      textureSupport.clearcoatNormalMap ||
        textureSupport.clearcoatMap ||
        textureSupport.clearcoatRoughnessMap ||
        textureSupport.transmissionMap ||
        textureSupport.thicknessMap ||
        textureSupport.iridescenceMap ||
        textureSupport.iridescenceThicknessMap ||
        textureSupport.sheenColorMap ||
        textureSupport.sheenRoughnessMap ||
        textureSupport.anisotropyMap ||
        textureSupport.specularIntensityMap ||
        textureSupport.specularColorMap
    );
  }, [selectedMaterialType, textureSupport]);

  /** three.js 原地改材质不会触发 React 更新；变更后递增以强制重读材质上的贴图引用 */
  const [materialUiEpoch, setMaterialUiEpoch] = useState(0);
  const firstMeshMaterial = useMemo(
    () => (editor ? getFirstMeshMaterial(editor.getSelected()) : null),
    [editor, materialUiEpoch, selectedMaterialType]
  );

  /**
   * 通用材质属性写入器。
   * @param key 材质字段名，如 `map` / `opacity` / `normalScale`
   * @param value 目标值，按 key 的字段类型传入
   */
  const onPropertyChange = (key: string, value: any) => {
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    if (key.endsWith('__dragStart')) {
      const actualKey = key.replace('__dragStart', '');
      materialSliderBeforeRef.current[actualKey] = mats.map((m) => ({
        material: m,
        value: (m as any)[actualKey]
      }));
      return;
    }
    if (key.endsWith('__preview')) {
      const actualKey = key.replace('__preview', '');
      for (const m of mats) {
        (m as any)[actualKey] = value;
        (m as any).needsUpdate = true;
      }
      setMaterialUiEpoch((e) => e + 1);
      editor.render();
      return;
    }
    const before = mats.map((m) => ({
      material: m,
      value: (m as any)[key]
    }));
    const beforeFromDrag = materialSliderBeforeRef.current[key];
    const effectiveBefore = beforeFromDrag && beforeFromDrag.length > 0 ? beforeFromDrag : before;
    if (beforeFromDrag) delete materialSliderBeforeRef.current[key];
    const firstBeforeValue = effectiveBefore[0]?.value;
    try {
      if (JSON.stringify(firstBeforeValue) === JSON.stringify(value)) return;
    } catch {
      // ignore
    }
    const applyValue = (nextValue: any) => {
      for (const m of mats) {
        (m as any)[key] = nextValue;
        (m as any).needsUpdate = true;
      }
      setMaterialUiEpoch((e) => e + 1);
      editor.render();
    };
    const valueText =
      typeof value === 'number'
        ? String(Number.isFinite(value) ? Number(value.toFixed(4)) : value)
        : typeof value === 'boolean'
          ? value
            ? 'true'
            : 'false'
          : typeof value === 'string'
            ? value
            : '';
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-${key}${valueText ? ` = ${valueText}` : ''}`,
        `Modify object property - ${root.uuid} - Material-${key}${valueText ? ` = ${valueText}` : ''}`
      ),
      mergeKey: `material-prop:${root.uuid}:${key}`,
      mergeWindowMs: 280,
      do: () => applyValue(value),
      undo: () => {
        for (const item of effectiveBefore) {
          (item.material as any)[key] = item.value;
          (item.material as any).needsUpdate = true;
        }
        setMaterialUiEpoch((e) => e + 1);
        editor.render();
      }
    });
  };

  /**
   * 单个贴图槽“效果开关”（不是上传/清除）。
   * 关闭时：缓存原值并置空材质字段；开启时：从缓存恢复。
   * @param fieldKey 贴图字段，如 `normalMap`
   * @param enabled true=开启效果，false=禁用效果
   */
  const setTextureFieldEffectEnabled = useCallback((fieldKey: TextureFieldKey, enabled: boolean) => {
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;

    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;

    // 只处理该字段，且仅在当前材质类型支持时生效
    if (!selectedMaterialType) return;
    if (textureSupportByMaterialType[selectedMaterialType]?.[fieldKey] !== true) return;

    if (!enabled) {
      // disable effect: cache -> set null
      for (const m of mats) {
        const id = (m as any)?.uuid;
        if (!id) continue;
        const prev = (m as any)[fieldKey] ?? null;
        textureDebugCacheRef.current[id] = {
          ...(textureDebugCacheRef.current[id] ?? {}),
          [fieldKey]: prev,
        };
        const u = ((m as any).userData ??= {});
        const disabledMap = (u[TEXTURE_EFFECT_DISABLED_KEY] ??= {});
        disabledMap[fieldKey] = true;
        (m as any)[fieldKey] = null;
        (m as any).needsUpdate = true;
      }
    } else {
      // enable effect: restore from cache (if any)
      for (const m of mats) {
        const id = (m as any)?.uuid;
        if (!id) continue;
        const u = ((m as any).userData ??= {});
        const disabledMap = (u[TEXTURE_EFFECT_DISABLED_KEY] ??= {});
        delete disabledMap[fieldKey];
        const snap = textureDebugCacheRef.current[id];
        if (!snap || !(fieldKey in snap)) continue;
        (m as any)[fieldKey] = (snap as any)[fieldKey] ?? null;
        (m as any).needsUpdate = true;
      }
    }

    setMaterialUiEpoch((e) => e + 1);
  }, [editor, selectedMaterialType]);

  const isTextureFieldEffectDisabled = useCallback(
    (fieldKey: TextureFieldKey) => {
      const mat: any = firstMeshMaterial as any;
      if (!mat) return false;
      const disabledMap = (mat?.userData?.[TEXTURE_EFFECT_DISABLED_KEY] ?? {}) as Partial<Record<TextureFieldKey, boolean>>;
      if (disabledMap[fieldKey] === true) return true;
      const id = mat?.uuid;
      const hasActiveTexture = Boolean(mat?.[fieldKey]);
      const hasCachedTexture = Boolean(id && textureDebugCacheRef.current[id]?.[fieldKey]);
      // “禁用效果”定义为：材质字段已置空，但缓存里仍有原贴图（可恢复）
      return !hasActiveTexture && hasCachedTexture;
    },
    [firstMeshMaterial]
  );

  /**
   * 获取 UI 侧当前应展示的贴图引用：
   * - 若该字段处于“禁用效果”，优先展示缓存值（便于对比）
   * - 否则展示材质字段当前值
   */
  const getTextureForUi = useCallback(
    (fieldKey: TextureFieldKey) => {
      const mat: any = firstMeshMaterial as any;
      if (!mat) return null;
      const id = mat?.uuid;
      if (id && isTextureFieldEffectDisabled(fieldKey)) {
        const cached = textureDebugCacheRef.current[id]?.[fieldKey];
        return cached ?? null;
      }
      return mat?.[fieldKey] ?? null;
    },
    [firstMeshMaterial, isTextureFieldEffectDisabled]
  );

  /**
   * 生成某贴图字段的上传处理器。
   * @param fieldKey 贴图字段 key
   * @param loader 文件 -> Texture 的异步加载函数
   */
  const makeTextureUploadHandler = useCallback(
    (fieldKey: TextureFieldKey, loader: (f: File) => Promise<any>) => {
      return async (f: File) => {
        const tex = await loader(f);
        // 若该贴图效果被禁用：只更新缓存，不让它立即影响渲染
        if (isTextureFieldEffectDisabled(fieldKey)) {
          const mat: any = firstMeshMaterial as any;
          const id = mat?.uuid;
          if (id) {
            textureDebugCacheRef.current[id] = {
              ...(textureDebugCacheRef.current[id] ?? {}),
              [fieldKey]: tex,
            };
            setMaterialUiEpoch((e) => e + 1);
          }
          return;
        }
        // 贴图效果开启时，直接写回材质字段并触发刷新
        onPropertyChange(fieldKey, tex);
      };
    },
    [firstMeshMaterial, isTextureFieldEffectDisabled, onPropertyChange]
  );

  /**
   * 生成某贴图字段的清除处理器。
   * @param fieldKey 贴图字段 key
   */
  const makeTextureClearHandler = useCallback(
    (fieldKey: TextureFieldKey) => {
      return () => {
        // 禁用中清除：清掉缓存即可（材质字段本来就为 null）
        if (isTextureFieldEffectDisabled(fieldKey)) {
          const mat: any = firstMeshMaterial as any;
          const id = mat?.uuid;
          if (id) {
            if (textureDebugCacheRef.current[id]) {
              delete (textureDebugCacheRef.current[id] as any)[fieldKey];
            }
            setMaterialUiEpoch((e) => e + 1);
          }
          return;
        }
        onPropertyChange(fieldKey, null);
      };
    },
    [firstMeshMaterial, isTextureFieldEffectDisabled, onPropertyChange]
  );

  /**
   * 为某贴图字段构造调试开关配置（label/checked/onChange）。
   * @param fieldKey 贴图字段 key
   */
  const makeTextureDebugToggle = useCallback(
    (fieldKey: TextureFieldKey) => {
      const mat: any = firstMeshMaterial as any;
      return {
        label: materialTextureDebugDisableOneLabel,
        checked: !Boolean(mat?.userData?.[TEXTURE_EFFECT_DISABLED_KEY]?.[fieldKey]),
        onChange: (checked: boolean) => {
          // checked=true 表示“开启效果”
          setTextureFieldEffectEnabled(fieldKey, checked);
        },
      };
    },
    [firstMeshMaterial, materialTextureDebugDisableOneLabel, setTextureFieldEffectEnabled]
  );

  /**
   * 把一个 hex 颜色批量写入 root 下所有 mesh 的顶点色 attribute。
   * @param root 选中对象根节点
   * @param hex 颜色字符串，如 #ffcc00
   */
  const applyVertexColorToMeshes = useCallback((root: any, hex: string) => {
    // 顶点色写入策略：基于 position 顶点数构建 color attribute，并替换到 mesh.geometry
    const rgb = hexToRgbNormalized(hex);
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
  }, []);

  /**
   * 材质类型变更处理。
   * @param nextType 用户在下拉框中选择的新材质类型
   */
  const handleMaterialTypeChange = useCallback((nextType: MaterialTypeKey) => {
    setSelectedMaterialType(nextType);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    const nextTextureSupport = textureSupportByMaterialType[nextType];
    const supportedTextureKeys = Object.keys(nextTextureSupport) as TextureFieldKey[];
    const prevType = selectedMaterialType;
    const applyType = (type: MaterialTypeKey | null) => {
      if (!type) return;
      const support = textureSupportByMaterialType[type];
      const keys = Object.keys(support) as TextureFieldKey[];
      switchMaterialTypeOnObject(root, type, { supportedTextureKeys: keys });
      setMaterialUiEpoch((e) => e + 1);
      syncFromObject(root);
      editor.render();
    };
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-材质类型 = ${pZh.materialTypeOptions[nextType] ?? nextType}`,
        `Modify object property - ${root.uuid} - Material-Material type = ${pEn.materialTypeOptions[nextType] ?? nextType}`
      ),
      do: () => applyType(nextType),
      undo: () => applyType(prevType)
    });
  }, [editor, syncFromObject]);

  /**
   * side 变更处理。
   * @param next FrontSide / BackSide / DoubleSide
   */
  const handleMaterialSideChange = useCallback((next: MaterialSideKey) => {
    setSelectedMaterialSide(next);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    const nextValue = materialSideKeyToValue[next];
    const before = mats.map((m) => ({ material: m, value: (m as any).side }));
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-面 = ${pZh.materialSideOptions[next] ?? next}`,
        `Modify object property - ${root.uuid} - Material-Side = ${pEn.materialSideOptions[next] ?? next}`
      ),
      do: () => {
        for (const m of mats) {
          (m as any).side = nextValue;
          (m as any).needsUpdate = true;
        }
        editor.render();
      },
      undo: () => {
        for (const item of before) {
          (item.material as any).side = item.value;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
  }, [editor]);

  /**
   * blending 变更处理。
   * @param next 混合模式 key
   */
  const handleBlendingChange = useCallback((next: MaterialBlendingKey) => {
    setSelectedBlendingMode(next);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getMeshMaterials(root);
    if (mats.length === 0) return;
    const nextValue = blendingKeyToValue[next];
    const before = mats.map((m) => ({ material: m, blending: (m as any).blending, premultipliedAlpha: (m as any).premultipliedAlpha }));
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-混合模式 = ${pZh.materialBlendingOptions[next] ?? next}`,
        `Modify object property - ${root.uuid} - Material-Blending mode = ${pEn.materialBlendingOptions[next] ?? next}`
      ),
      do: () => {
        for (const m of mats) {
          (m as any).blending = nextValue;
          if (typeof (m as any).premultipliedAlpha === 'boolean') (m as any).premultipliedAlpha = next === 'SubtractiveBlending';
          (m as any).needsUpdate = true;
        }
        editor.render();
      },
      undo: () => {
        for (const item of before) {
          (item.material as any).blending = item.blending;
          if (typeof (item.material as any).premultipliedAlpha === 'boolean') (item.material as any).premultipliedAlpha = item.premultipliedAlpha;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
  }, [editor]);

  /**
   * 材质颜色变更处理。
   * @param nextColor 目标颜色（#rrggbb）
   */
  const handleMaterialColorChange = useCallback((nextColor: string) => {
    setSelectedMaterialColor(nextColor);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    const before = mats.map((m) => ({ material: m, hex: getMaterialColorValue(m) }));
    const applyColor = (hex: string) => {
      for (const m of mats) {
        const c = (m as any).color;
        if (!c) continue;
        if (typeof c.set === 'function') c.set(hex);
        else (m as any).color = hex;
        (m as any).needsUpdate = true;
      }
      editor.render();
    };
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-颜色 = ${nextColor}`,
        `Modify object property - ${root.uuid} - Material-Color = ${nextColor}`
      ),
      mergeKey: `material-color:${root.uuid}`,
      mergeWindowMs: 280,
      do: () => applyColor(nextColor),
      undo: () => applyColor(before[0]?.hex ?? '#ffffff')
    });
  }, [editor]);

  /**
   * transparent 开关处理。
   * @param nextEnabled 是否开启透明混合
   */
  const handleTransparentEnabledChange = useCallback((nextEnabled: boolean) => {
    setSelectedMaterialTransparentEnabled(nextEnabled);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    const before = mats.map((m) => ({ material: m, value: Boolean((m as any).transparent) }));
    const v = boolText(nextEnabled);
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-透明开关 = ${v.zh}`,
        `Modify object property - ${root.uuid} - Material-Transparency = ${v.en}`
      ),
      do: () => {
        for (const m of mats) {
          (m as any).transparent = nextEnabled;
          (m as any).needsUpdate = true;
        }
        editor.render();
      },
      undo: () => {
        for (const item of before) {
          (item.material as any).transparent = item.value;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
  }, [editor]);

  /**
   * opacity 滑杆变更处理。
   * @param raw UI 原始输入值（会被 clamp 到 0~1）
   */
  const handleOpacityPreviewChange = useCallback((raw: number) => {
    const next = clamp01(raw);
    setSelectedMaterialOpacity(next);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    for (const m of mats) {
      if (typeof (m as any).opacity !== 'number') continue;
      (m as any).opacity = next;
      if (selectedMaterialTransparentEnabled) (m as any).transparent = true;
      (m as any).needsUpdate = true;
    }
    editor.render();
  }, [editor, selectedMaterialTransparentEnabled]);

  const handleOpacityDragStart = useCallback(() => {
    opacityDragStartValueRef.current = selectedMaterialOpacity;
  }, [selectedMaterialOpacity]);

  const handleOpacityCommit = useCallback((raw: number) => {
    const next = clamp01(raw);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    const beforeValue = opacityDragStartValueRef.current ?? selectedMaterialOpacity;
    if (Math.abs(beforeValue - next) <= 1e-6) return;
    const before = mats.map((m) => ({ material: m, opacity: (m as any).opacity, transparent: (m as any).transparent }));
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-不透明度 = ${Number(next.toFixed(4))}`,
        `Modify object property - ${root.uuid} - Material-Opacity = ${Number(next.toFixed(4))}`
      ),
      do: () => {
        for (const m of mats) {
          if (typeof (m as any).opacity !== 'number') continue;
          (m as any).opacity = next;
          if (selectedMaterialTransparentEnabled) (m as any).transparent = true;
          (m as any).needsUpdate = true;
        }
        editor.render();
      },
      undo: () => {
        for (const item of before) {
          (item.material as any).opacity = item.opacity;
          (item.material as any).transparent = item.transparent;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
    opacityDragStartValueRef.current = null;
  }, [editor, selectedMaterialOpacity, selectedMaterialTransparentEnabled]);

  /**
   * wireframe 开关处理。
   * @param next 是否开启线框
   */
  const handleWireframeChange = useCallback((next: boolean) => {
    setSelectedMaterialWireframe(next);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    const before = mats.map((m) => ({ material: m, value: Boolean((m as any).wireframe) }));
    const v = boolText(next);
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-线框 = ${v.zh}`,
        `Modify object property - ${root.uuid} - Material-Wireframe = ${v.en}`
      ),
      do: () => {
        for (const m of mats) {
          if (typeof (m as any).wireframe !== 'boolean') continue;
          (m as any).wireframe = next;
          (m as any).needsUpdate = true;
        }
        editor.render();
      },
      undo: () => {
        for (const item of before) {
          (item.material as any).wireframe = item.value;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
  }, [editor]);

  /**
   * alphaToCoverage 开关处理。
   * @param nextEnabled 是否开启单通道覆盖
   */
  const handleForceSingleChannelChange = useCallback((nextEnabled: boolean) => {
    setSelectedMaterialForceSingleChannelEnabled(nextEnabled);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    const before = mats.map((m) => ({ material: m, value: Boolean((m as any).alphaToCoverage) }));
    const v = boolText(nextEnabled);
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-强制单通道 = ${v.zh}`,
        `Modify object property - ${root.uuid} - Material-Force single channel = ${v.en}`
      ),
      do: () => {
        for (const m of mats) {
          (m as any).alphaToCoverage = nextEnabled;
          (m as any).needsUpdate = true;
        }
        editor.render();
      },
      undo: () => {
        for (const item of before) {
          (item.material as any).alphaToCoverage = item.value;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
  }, [editor]);

  /**
   * alphaTest 阈值变更处理。
   * @param raw UI 原始输入值（会被 clamp 到 0~1）
   */
  const handleAlphaTestPreviewChange = useCallback((raw: number) => {
    const next = clamp01(raw);
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
    editor.render();
  }, [editor]);

  const handleAlphaTestDragStart = useCallback(() => {
    alphaTestDragStartValueRef.current = selectedMaterialAlphaTestThreshold;
  }, [selectedMaterialAlphaTestThreshold]);

  const handleAlphaTestCommit = useCallback((raw: number) => {
    const next = clamp01(raw);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    const beforeValue = alphaTestDragStartValueRef.current ?? selectedMaterialAlphaTestThreshold;
    if (Math.abs(beforeValue - next) <= 1e-6) return;
    const before = mats.map((m) => ({ material: m, value: (m as any).alphaTest }));
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-AlphaTest = ${Number(next.toFixed(4))}`,
        `Modify object property - ${root.uuid} - Material-Alpha test = ${Number(next.toFixed(4))}`
      ),
      do: () => {
        for (const m of mats) {
          if (typeof (m as any).alphaTest !== 'number') continue;
          (m as any).alphaTest = next;
          (m as any).needsUpdate = true;
        }
        editor.render();
      },
      undo: () => {
        for (const item of before) {
          (item.material as any).alphaTest = item.value;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
    alphaTestDragStartValueRef.current = null;
  }, [editor, selectedMaterialAlphaTestThreshold]);

  /**
   * depthTest 开关处理。
   * @param next 是否开启深度测试
   */
  const handleDepthTestChange = useCallback((next: boolean) => {
    setSelectedMaterialDepthTest(next);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    const before = mats.map((m) => ({ material: m, value: Boolean((m as any).depthTest) }));
    const v = boolText(next);
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-深度测试 = ${v.zh}`,
        `Modify object property - ${root.uuid} - Material-Depth test = ${v.en}`
      ),
      do: () => {
        for (const m of mats) {
          if (typeof (m as any).depthTest !== 'boolean') continue;
          (m as any).depthTest = next;
          (m as any).needsUpdate = true;
        }
        editor.render();
      },
      undo: () => {
        for (const item of before) {
          (item.material as any).depthTest = item.value;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
  }, [editor]);

  /**
   * depthWrite 开关处理。
   * @param next 是否开启深度写入
   */
  const handleDepthWriteChange = useCallback((next: boolean) => {
    setSelectedMaterialDepthWrite(next);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    if (mats.length === 0) return;
    const before = mats.map((m) => ({ material: m, value: Boolean((m as any).depthWrite) }));
    const v = boolText(next);
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-深度写入 = ${v.zh}`,
        `Modify object property - ${root.uuid} - Material-Depth write = ${v.en}`
      ),
      do: () => {
        for (const m of mats) {
          if (typeof (m as any).depthWrite !== 'boolean') continue;
          (m as any).depthWrite = next;
          (m as any).needsUpdate = true;
        }
        editor.render();
      },
      undo: () => {
        for (const item of before) {
          (item.material as any).depthWrite = item.value;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
  }, [editor]);

  /**
   * 顶点色总开关处理。
   * @param next 是否开启顶点色
   */
  const handleVertexColorsEnabledChange = useCallback((next: boolean) => {
    setSelectedVertexColorsEnabled(next);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    const before = mats.map((m) => ({ material: m, vertexColors: Boolean((m as any).vertexColors) }));
    const applyVertexColors = (enabled: boolean) => {
      for (const m of mats) {
        (m as any).vertexColors = enabled;
        (m as any).needsUpdate = true;
      }
      if (enabled) applyVertexColorToMeshes(root, selectedVertexColor);
      editor.render();
    };
    const v = boolText(next);
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-顶点颜色开关 = ${v.zh}`,
        `Modify object property - ${root.uuid} - Material-Vertex color enabled = ${v.en}`
      ),
      do: () => applyVertexColors(next),
      undo: () => {
        for (const item of before) {
          (item.material as any).vertexColors = item.vertexColors;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
  }, [applyVertexColorToMeshes, editor, selectedVertexColor]);

  /**
   * 顶点色颜色变更处理。
   * @param nextColor 目标颜色（#rrggbb）
   */
  const handleVertexColorChange = useCallback((nextColor: string) => {
    setSelectedVertexColor(nextColor);
    if (!editor) return;
    const root = editor.getSelected();
    if (!root) return;
    const mats = getAllMeshMaterials(root);
    const before = mats.map((m) => ({ material: m, vertexColors: Boolean((m as any).vertexColors) }));
    const applyColor = (color: string) => {
      for (const m of mats) {
        (m as any).vertexColors = true;
        (m as any).needsUpdate = true;
      }
      applyVertexColorToMeshes(root, color);
      editor.render();
    };
    void editor.executeHistoryOperation({
      name: historyName(
        `修改物体属性 - ${root.uuid} - 材质-顶点颜色 = ${nextColor}`,
        `Modify object property - ${root.uuid} - Material-Vertex color = ${nextColor}`
      ),
      mergeKey: `material-vertex-color:${root.uuid}`,
      mergeWindowMs: 280,
      do: () => applyColor(nextColor),
      undo: () => {
        for (const item of before) {
          (item.material as any).vertexColors = item.vertexColors;
          (item.material as any).needsUpdate = true;
        }
        editor.render();
      }
    });
  }, [applyVertexColorToMeshes, editor]);

  return (
    <div className="space-y-3 select-none">
      {!selectedMaterialType ? (
        <div className="text-xs text-[var(--text-secondary)]">{t.placeholders.materials}</div>
      ) : (
        <div className="space-y-1">
          <MaterialMainControlsSection
            p={p} // 主控区文案集合
            selectedMaterialType={selectedMaterialType} // 当前材质类型
            options={options} // 材质类型下拉选项
            selectedMaterialSide={selectedMaterialSide} // 当前 side
            sideOptionsList={sideOptionsList} // side 下拉选项
            selectedBlendingMode={selectedBlendingMode} // 当前 blending
            blendingOptionsList={blendingOptionsList} // blending 下拉选项
            blendingDescriptions={blendingDescriptions} // blending 说明文本
            selectedMaterialColor={selectedMaterialColor} // 当前材质颜色
            selectedMaterialTransparentEnabled={selectedMaterialTransparentEnabled} // transparent 开关状态
            selectedMaterialOpacity={selectedMaterialOpacity} // opacity 数值
            selectedMaterialWireframe={selectedMaterialWireframe} // wireframe 开关状态
            selectedMaterialForceSingleChannelEnabled={selectedMaterialForceSingleChannelEnabled} // alphaToCoverage 状态
            selectedMaterialAlphaTestThreshold={selectedMaterialAlphaTestThreshold} // alphaTest 阈值
            selectedMaterialDepthTest={selectedMaterialDepthTest} // depthTest 状态
            selectedMaterialDepthWrite={selectedMaterialDepthWrite} // depthWrite 状态
            selectedVertexColorsEnabled={selectedVertexColorsEnabled} // 顶点色开关状态
            selectedVertexColor={selectedVertexColor} // 顶点色当前值
            onMaterialTypeChange={handleMaterialTypeChange} // 切换材质类型
            onMaterialSideChange={handleMaterialSideChange} // 切换 side
            onBlendingChange={handleBlendingChange} // 切换 blending
            onMaterialColorChange={handleMaterialColorChange} // 修改材质颜色
            onTransparentEnabledChange={handleTransparentEnabledChange} // 修改 transparent 开关
            onOpacityPreviewChange={handleOpacityPreviewChange} // 预览 opacity
            onOpacityCommit={handleOpacityCommit} // 提交 opacity
            onOpacityDragStart={handleOpacityDragStart} // 记录拖拽起点
            onWireframeChange={handleWireframeChange} // 修改 wireframe
            onForceSingleChannelChange={handleForceSingleChannelChange} // 修改 alphaToCoverage
            onAlphaTestPreviewChange={handleAlphaTestPreviewChange} // 预览 alphaTest
            onAlphaTestCommit={handleAlphaTestCommit} // 提交 alphaTest
            onAlphaTestDragStart={handleAlphaTestDragStart} // 记录拖拽起点
            onDepthTestChange={handleDepthTestChange} // 修改 depthTest
            onDepthWriteChange={handleDepthWriteChange} // 修改 depthWrite
            onVertexColorsEnabledChange={handleVertexColorsEnabledChange} // 修改顶点色开关
            onVertexColorChange={handleVertexColorChange} // 修改顶点色颜色
          />

          {/* Texture Maps：无可用贴图槽时整块不展示（含主标题）；分组内无槽时不展示该组标题 */}
          {hasAnyMaterialTextureField && textureSupport ? (
            <MaterialTextureMapsSection
              p={p} // 贴图区文案集合
              tf={tf} // 各贴图字段标题文案
              textureSupport={textureSupport} // 当前材质支持的贴图白名单
              textureMapLabels={textureMapLabels} // 上传/清除/空态文案
              hasTextureGroupBasic={hasTextureGroupBasic} // 是否显示基础组
              hasTextureGroupLighting={hasTextureGroupLighting} // 是否显示光照组
              hasTextureGroupNormal={hasTextureGroupNormal} // 是否显示法线/形变组
              hasTextureGroupPbr={hasTextureGroupPbr} // 是否显示 PBR 组
              hasTextureGroupAdvanced={hasTextureGroupAdvanced} // 是否显示高级物理组
              selectedEnvMapIntensity={selectedEnvMapIntensity} // 环境贴图强度当前值
              setSelectedEnvMapIntensity={setSelectedEnvMapIntensity} // 更新环境贴图强度状态
              selectedAoMapIntensity={selectedAoMapIntensity} // AO 强度当前值
              setSelectedAoMapIntensity={setSelectedAoMapIntensity} // 更新 AO 强度状态
              selectedNormalScale={selectedNormalScale} // normalScale 当前值
              setSelectedNormalScale={setSelectedNormalScale} // 更新 normalScale 状态
              selectedClearcoatNormalScale={selectedClearcoatNormalScale} // clearcoatNormalScale 当前值
              setSelectedClearcoatNormalScale={setSelectedClearcoatNormalScale} // 更新 clearcoatNormalScale 状态
              getTextureForUi={getTextureForUi} // 获取 UI 应显示的贴图（含缓存逻辑）
              makeTextureDebugToggle={makeTextureDebugToggle} // 生成单项贴图效果开关
              makeTextureUploadHandler={makeTextureUploadHandler} // 生成上传处理器
              makeTextureClearHandler={makeTextureClearHandler} // 生成清除处理器
              onPropertyChange={onPropertyChange} // 通用材质字段写入器
            />
          ) : null}
        </div>
      )}
    </div>
  );
}


