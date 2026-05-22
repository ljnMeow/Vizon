import { useEffect, useMemo, useRef, useState } from 'react';

import { Accordion } from '../../../../components/Accordion';
import { BaseSetting } from './BaseSetting';
import { ObjectAttributes } from './ObjectAttributes';
import { message } from '../../../../components/GlobalMessage';
import { useLocale } from '../../../../hooks/useLocale';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { appMessages } from '../../../../i18n/messages';
import { encodeHistoryI18nName } from '../../../../utils/historyI18n';
import { VIZON_USER_DATA_KEYS } from '../../../../utils/keys';
import { copyToClipboard } from '../../../../utils/utils';
import { basicModels } from '../../../../utils/models';
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

/** 内置基础模型 key 集合，用于判断当前对象是否支持参数化几何属性编辑 */
const BASIC_MODEL_KEYS = new Set(basicModels.map((m) => m.key));

// NOTE: web 侧依赖的 `vizon-3d-core` 版本可能暂未包含这些新 key 的类型声明；
// 这里用 runtime fallback + string key，避免 TS 报错并保持兼容。
const RECT_AREA_LIGHT_TARGET_KEY: string =
  (VIZON_USER_DATA_KEYS as any)?.DEFAULTS?.RECT_AREA_LIGHT_TARGET ?? '__vizonRectAreaLightTarget';
const LIGHT_TARGET_LIGHT_UUID_KEY: string =
  (VIZON_USER_DATA_KEYS as any)?.DEFAULTS?.LIGHT_TARGET_LIGHT_UUID ?? '__vizonLightTargetLightUuid';

/** 两种语言的属性标签，appMessages 是静态导入，无需在组件内每次重新读取。 */
const LABELS_ZH = appMessages['zh-CN'].designPage.inspector.propertiesSettings;
const LABELS_EN = appMessages['en-US'].designPage.inspector.propertiesSettings;

/** 构造双语历史记录操作名，纯函数，提取到模块级避免每次渲染重新创建闭包。 */
function historyName(zhName: string, enName: string) {
  return encodeHistoryI18nName({ 'zh-CN': zhName, 'en-US': enName });
}

/** 从当前选中对象读取基础信息 */
function readSelectedInfo(obj: any): SelectedObjectInfo {
  if (!obj) return null;
  return {
    uuid: obj.uuid,
    type: String(obj.type ?? 'Object'),
    name: String(obj.name ?? '')
  };
}

/** 从当前选中对象读取变换属性，统一转成可编辑的数值结构 */
function readSelectedTransform(obj: any): TransformState {
  return {
    position: {
      x: Number(obj?.position?.x ?? 0),
      y: Number(obj?.position?.y ?? 0),
      z: Number(obj?.position?.z ?? 0)
    },
    rotation: {
      x: Number(obj?.rotation?.x ?? 0),
      y: Number(obj?.rotation?.y ?? 0),
      z: Number(obj?.rotation?.z ?? 0)
    },
    scale: {
      x: Number(obj?.scale?.x ?? 1),
      y: Number(obj?.scale?.y ?? 1),
      z: Number(obj?.scale?.z ?? 1)
    }
  };
}

function getHistoryCategoryI18n(type?: string): { zh: string; en: string } {
  if (!type) return { zh: '修改物体属性', en: 'Modify object property' };
  if (type === 'OrthographicCamera') return { zh: '修改正交相机属性', en: 'Modify orthographic camera property' };
  if (type === 'PerspectiveCamera') return { zh: '修改透视相机属性', en: 'Modify perspective camera property' };
  if (type.endsWith('Camera')) return { zh: '修改相机属性', en: 'Modify camera property' };
  if (type === 'DirectionalLight') return { zh: '修改平行光属性', en: 'Modify directional light property' };
  if (type === 'PointLight') return { zh: '修改点光源属性', en: 'Modify point light property' };
  if (type === 'SpotLight') return { zh: '修改聚光灯属性', en: 'Modify spot light property' };
  if (type === 'AmbientLight') return { zh: '修改环境光属性', en: 'Modify ambient light property' };
  if (type === 'HemisphereLight') return { zh: '修改半球光属性', en: 'Modify hemisphere light property' };
  if (type === 'RectAreaLight') return { zh: '修改矩形光属性', en: 'Modify rect area light property' };
  if (type.endsWith('Light')) return { zh: '修改灯光属性', en: 'Modify light property' };
  return { zh: '修改物体属性', en: 'Modify object property' };
}

function boolTextI18n(v: boolean): { zh: string; en: string } {
  return v ? { zh: '是', en: 'true' } : { zh: '否', en: 'false' };
}

/** 读取阴影与视锥裁剪能力及当前值 */
function readSelectedShadow(obj: any): ShadowState | null {
  if (!obj) return null;

  const isLight = Boolean((obj as any)?.isLight);
  const canLightCastShadow = Boolean((obj as any)?.isDirectionalLight || (obj as any)?.isSpotLight || (obj as any)?.isPointLight);
  const canCastShadow = isLight ? canLightCastShadow : typeof (obj as any).castShadow === 'boolean';
  const canReceiveShadow = typeof (obj as any).receiveShadow === 'boolean';
  const canFrustumCulled = typeof (obj as any).frustumCulled === 'boolean';

  return {
    castShadow: canCastShadow ? Boolean((obj as any).castShadow) : false,
    receiveShadow: canReceiveShadow ? Boolean((obj as any).receiveShadow) : false,
    frustumCulled: canFrustumCulled ? Boolean((obj as any).frustumCulled) : false,
    canCastShadow,
    canReceiveShadow,
    canFrustumCulled
  };
}

/** 判断对象及其祖先中是否存在“不可拾取”标记 */
function computeIsNonPickableInHierarchy(obj: any): boolean {
  let cur: any = obj;
  while (cur) {
    if (Boolean(cur?.userData?.[VIZON_USER_DATA_KEYS.COMMON.NON_PICKABLE])) return true;
    cur = cur.parent;
  }
  return false;
}

/** 判断祖先链上是否存在不可选择节点，用于限制某些交互开关 */
function hasNonSelectableAncestor(obj: any): boolean {
  let cur: any = obj?.parent;
  while (cur) {
    if (Boolean(cur?.userData?.[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE])) return true;
    cur = cur.parent;
  }
  return false;
}

/** 计算对象是否允许进入冻结态，避免对相机/灯光/控制器等特殊对象误操作 */
function computeFreezeCapability(obj: any): boolean {
  if ((obj as any)?.isCamera) return false;
  if ((obj as any)?.isLight) return false;
  if ((obj as any)?.isBone) return false;
  if ((obj as any)?.isSkinnedMesh) return false;
  if ((obj as any)?.isTransformControls) return false;
  if (obj?.type === 'TransformControlsGizmo' || obj?.type === 'TransformControlsPlane') return false;
  if (Boolean(obj?.userData?.[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE])) return false;
  return true;
}

/** 读取可见、可拾取与冻结相关状态 */
function readSelectedVisibilityPickFreeze(obj: any): VisibilityPickFreezeState | null {
  if (!obj) return null;

  const visible = Boolean(obj.visible);
  const pickable = !computeIsNonPickableInHierarchy(obj);
  const frozen = !Boolean(obj?.userData?.[VIZON_USER_DATA_KEYS.COMMON.DYNAMIC]) && obj?.matrixAutoUpdate === false;
  const canPickable = !hasNonSelectableAncestor(obj);
  const canFreeze = computeFreezeCapability(obj);

  return {
    visible,
    pickable,
    frozen,
    canPickable,
    canFreeze
  };
}

function getObjectMaterials(root: any): any[] {
  const materials: any[] = [];
  if (!root?.traverse) return materials;

  root.traverse((child: any) => {
    const material = child?.material;
    if (!material) return;
    const list = Array.isArray(material) ? material : [material];
    for (const m of list) {
      if (!m) continue;
      if (typeof m.opacity !== 'number') continue;
      if (typeof m.transparent !== 'boolean') continue;
      materials.push(m);
    }
  });

  return materials;
}

function readSelectedOpacity(obj: any): OpacityState | null {
  if (!obj) return null;

  const materials = getObjectMaterials(obj);
  if (materials.length === 0) return { opacity: 1, canOpacity: false };

  const opacity = typeof materials[0].opacity === 'number' ? materials[0].opacity : 1;
  return { opacity, canOpacity: true };
}

function readSelectedRenderOrder(obj: any): RenderOrderState | null {
  if (!obj) return null;
  const v = typeof (obj as any).renderOrder === 'number' ? (obj as any).renderOrder : 0;
  return { renderOrder: v, canRenderOrder: true };
}

function readSelectedPerspectiveCameraParams(obj: any): PerspectiveCameraParamsState | null {
  if (!obj) return null;
  if (!(obj as any)?.isPerspectiveCamera) return null;
  return {
    fov: typeof (obj as any).fov === 'number' ? Number((obj as any).fov) : 50,
    near: typeof (obj as any).near === 'number' ? Number((obj as any).near) : 0.1,
    far: typeof (obj as any).far === 'number' ? Number((obj as any).far) : 200,
    zoom: typeof (obj as any).zoom === 'number' ? Number((obj as any).zoom) : 1,
    canEdit: true
  };
}

function readSelectedOrthographicCameraParams(obj: any): OrthographicCameraParamsState | null {
  if (!obj) return null;
  if (!(obj as any)?.isOrthographicCamera) return null;
  return {
    left: typeof (obj as any).left === 'number' ? Number((obj as any).left) : -1,
    right: typeof (obj as any).right === 'number' ? Number((obj as any).right) : 1,
    top: typeof (obj as any).top === 'number' ? Number((obj as any).top) : 1,
    bottom: typeof (obj as any).bottom === 'number' ? Number((obj as any).bottom) : -1,
    near: typeof (obj as any).near === 'number' ? Number((obj as any).near) : 0.1,
    far: typeof (obj as any).far === 'number' ? Number((obj as any).far) : 200,
    zoom: typeof (obj as any).zoom === 'number' ? Number((obj as any).zoom) : 1,
    canEdit: true
  };
}

function readSelectedLightColor(obj: any): LightColorState | null {
  if (!obj) return null;
  const isLight = Boolean((obj as any)?.isLight);
  const color = (obj as any)?.color;
  const canColor = isLight && color && typeof color.getHexString === 'function';
  if (!canColor) return null;
  return { color: `#${String(color.getHexString()).toLowerCase()}`, canColor: true };
}

function readSelectedLightIntensity(obj: any): LightIntensityState | null {
  if (!obj) return null;
  const isLight = Boolean((obj as any)?.isLight);
  const intensity = (obj as any)?.intensity;
  const canIntensity = isLight && typeof intensity === 'number';
  if (!canIntensity) return null;
  return { intensity: Number(intensity), canIntensity: true };
}

function readSelectedDirectionalLightTarget(obj: any): LightTargetState | null {
  if (!obj || !(obj as any)?.isDirectionalLight) return null;
  const t = (obj as any)?.target?.position;
  if (!t) return null;
  return {
    target: { x: Number(t.x ?? 0), y: Number(t.y ?? 0), z: Number(t.z ?? 0) },
    canEdit: true
  };
}

function readSelectedSpotLightParams(obj: any): SpotLightParamsState | null {
  if (!obj || !(obj as any)?.isSpotLight) return null;
  const t = (obj as any)?.target?.position;
  if (!t) return null;
  return {
    distance: typeof (obj as any).distance === 'number' ? Number((obj as any).distance) : 0,
    angle: typeof (obj as any).angle === 'number' ? Number((obj as any).angle) : Math.PI / 3,
    penumbra: typeof (obj as any).penumbra === 'number' ? Number((obj as any).penumbra) : 0,
    decay: typeof (obj as any).decay === 'number' ? Number((obj as any).decay) : 2,
    focus: typeof (obj as any).focus === 'number' ? Number((obj as any).focus) : 1,
    target: { x: Number(t.x ?? 0), y: Number(t.y ?? 0), z: Number(t.z ?? 0) },
    canEdit: true
  };
}

function readSelectedPointLightParams(obj: any): PointLightParamsState | null {
  if (!obj || !(obj as any)?.isPointLight) return null;
  return {
    distance: typeof (obj as any).distance === 'number' ? Number((obj as any).distance) : 0,
    decay: typeof (obj as any).decay === 'number' ? Number((obj as any).decay) : 2,
    canEdit: true
  };
}

function readSelectedHemisphereLightParams(obj: any): HemisphereLightParamsState | null {
  if (!obj || !(obj as any)?.isHemisphereLight) return null;
  const c = (obj as any)?.groundColor;
  const canEdit = Boolean(c && typeof c.getHexString === 'function');
  if (!canEdit) return null;
  return { groundColor: `#${String(c.getHexString()).toLowerCase()}`, canEdit: true };
}

function readSelectedRectAreaLightParams(obj: any): RectAreaLightParamsState | null {
  if (!obj || !(obj as any)?.isRectAreaLight) return null;
  const width = typeof (obj as any).width === 'number' ? Number((obj as any).width) : 1;
  const height = typeof (obj as any).height === 'number' ? Number((obj as any).height) : 1;
  const ud = (obj as any)?.userData ?? {};
  const t = ud?.[RECT_AREA_LIGHT_TARGET_KEY];
  const target = t && typeof t === 'object'
    ? { x: Number(t.x ?? 0), y: Number(t.y ?? 0), z: Number(t.z ?? 0) }
    : { x: 0, y: 0, z: 0 };
  return { width, height, target, canEdit: true };
}

function readSelectedDirectionalLightShadow(obj: any): DirectionalLightShadowState | null {
  if (!obj || !(obj as any)?.isDirectionalLight) return null;
  const shadow = (obj as any)?.shadow;
  if (!shadow) return null;
  return {
    intensity: typeof shadow.intensity === 'number' ? Number(shadow.intensity) : 1,
    bias: typeof shadow.bias === 'number' ? Number(shadow.bias) : 0,
    normalBias: typeof shadow.normalBias === 'number' ? Number(shadow.normalBias) : 0,
    radius: typeof shadow.radius === 'number' ? Number(shadow.radius) : 1,
    mapSizeWidth: typeof shadow.mapSize?.width === 'number' ? Number(shadow.mapSize.width) : 1024,
    mapSizeHeight: typeof shadow.mapSize?.height === 'number' ? Number(shadow.mapSize.height) : 1024,
    left: typeof shadow.camera?.left === 'number' ? Number(shadow.camera.left) : -5,
    right: typeof shadow.camera?.right === 'number' ? Number(shadow.camera.right) : 5,
    top: typeof shadow.camera?.top === 'number' ? Number(shadow.camera.top) : 5,
    bottom: typeof shadow.camera?.bottom === 'number' ? Number(shadow.camera.bottom) : -5,
    near: typeof shadow.camera?.near === 'number' ? Number(shadow.camera.near) : 0.5,
    far: typeof shadow.camera?.far === 'number' ? Number(shadow.camera.far) : 500,
    helperVisible: (obj as any)?.userData?.[VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE] !== false,
    canEdit: true
  };
}

function readSelectedSpotLightShadow(obj: any): SpotLightShadowState | null {
  if (!obj || !(obj as any)?.isSpotLight) return null;
  const shadow = (obj as any)?.shadow;
  if (!shadow) return null;
  return {
    intensity: typeof shadow.intensity === 'number' ? Number(shadow.intensity) : 1,
    bias: typeof shadow.bias === 'number' ? Number(shadow.bias) : 0,
    normalBias: typeof shadow.normalBias === 'number' ? Number(shadow.normalBias) : 0,
    radius: typeof shadow.radius === 'number' ? Number(shadow.radius) : 1,
    mapSizeWidth: typeof shadow.mapSize?.width === 'number' ? Number(shadow.mapSize.width) : 1024,
    mapSizeHeight: typeof shadow.mapSize?.height === 'number' ? Number(shadow.mapSize.height) : 1024,
    near: typeof shadow.camera?.near === 'number' ? Number(shadow.camera.near) : 0.1,
    far: typeof shadow.camera?.far === 'number' ? Number(shadow.camera.far) : 20,
    fov: typeof shadow.camera?.fov === 'number' ? Number(shadow.camera.fov) : 45,
    helperVisible: (obj as any)?.userData?.[VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE] !== false,
    canEdit: true
  };
}

function readSelectedPointLightShadow(obj: any): PointLightShadowState | null {
  if (!obj || !(obj as any)?.isPointLight) return null;
  const shadow = (obj as any)?.shadow;
  if (!shadow) return null;
  return {
    intensity: typeof shadow.intensity === 'number' ? Number(shadow.intensity) : 1,
    bias: typeof shadow.bias === 'number' ? Number(shadow.bias) : 0,
    normalBias: typeof shadow.normalBias === 'number' ? Number(shadow.normalBias) : 0,
    radius: typeof shadow.radius === 'number' ? Number(shadow.radius) : 1,
    mapSizeWidth: typeof shadow.mapSize?.width === 'number' ? Number(shadow.mapSize.width) : 1024,
    mapSizeHeight: typeof shadow.mapSize?.height === 'number' ? Number(shadow.mapSize.height) : 1024,
    near: typeof shadow.camera?.near === 'number' ? Number(shadow.camera.near) : 0.1,
    far: typeof shadow.camera?.far === 'number' ? Number(shadow.camera.far) : 20,
    helperVisible: (obj as any)?.userData?.[VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE] !== false,
    canEdit: true
  };
}

export function PropertiesSettings() {
  const { locale } = useLocale();
  const t = appMessages[locale].designPage.inspector;
  const { editor } = useSceneSettings();

  const [selectedInfo, setSelectedInfo] = useState<SelectedObjectInfo>(null);
  const [transform, setTransform] = useState<TransformState | null>(null);
  const [shadow, setShadow] = useState<ShadowState | null>(null);
  const [visibilityPickFreeze, setVisibilityPickFreeze] = useState<VisibilityPickFreezeState | null>(null);
  const [opacityState, setOpacityState] = useState<OpacityState | null>(null);
  const [renderOrderState, setRenderOrderState] = useState<RenderOrderState | null>(null);
  const [perspectiveCameraParamsState, setPerspectiveCameraParamsState] = useState<PerspectiveCameraParamsState | null>(null);
  const [orthographicCameraParamsState, setOrthographicCameraParamsState] = useState<OrthographicCameraParamsState | null>(null);
  const [lightColorState, setLightColorState] = useState<LightColorState | null>(null);
  const [lightIntensityState, setLightIntensityState] = useState<LightIntensityState | null>(null);
  const [directionalLightTargetState, setDirectionalLightTargetState] = useState<LightTargetState | null>(null);
  const [spotLightParamsState, setSpotLightParamsState] = useState<SpotLightParamsState | null>(null);
  const [pointLightParamsState, setPointLightParamsState] = useState<PointLightParamsState | null>(null);
  const [hemisphereLightParamsState, setHemisphereLightParamsState] = useState<HemisphereLightParamsState | null>(null);
  const [rectAreaLightParamsState, setRectAreaLightParamsState] = useState<RectAreaLightParamsState | null>(null);
  const [directionalLightShadowState, setDirectionalLightShadowState] = useState<DirectionalLightShadowState | null>(null);
  const [spotLightShadowState, setSpotLightShadowState] = useState<SpotLightShadowState | null>(null);
  const [pointLightShadowState, setPointLightShadowState] = useState<PointLightShadowState | null>(null);
  const lightColorHistoryBaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editor) return;

    const selected = editor.getSelected();
    setSelectedInfo(readSelectedInfo(selected));
    setTransform(selected ? readSelectedTransform(selected) : null);
    setShadow(selected ? readSelectedShadow(selected) : null);
    setVisibilityPickFreeze(selected ? readSelectedVisibilityPickFreeze(selected) : null);
    setOpacityState(selected ? readSelectedOpacity(selected) : null);
    setRenderOrderState(selected ? readSelectedRenderOrder(selected) : null);
    setPerspectiveCameraParamsState(selected ? readSelectedPerspectiveCameraParams(selected) : null);
    setOrthographicCameraParamsState(selected ? readSelectedOrthographicCameraParams(selected) : null);
    const selectedLightColor = selected ? readSelectedLightColor(selected) : null;
    setLightColorState(selectedLightColor);
    setLightIntensityState(selected ? readSelectedLightIntensity(selected) : null);
    setDirectionalLightTargetState(selected ? readSelectedDirectionalLightTarget(selected) : null);
    setSpotLightParamsState(selected ? readSelectedSpotLightParams(selected) : null);
    setPointLightParamsState(selected ? readSelectedPointLightParams(selected) : null);
    setHemisphereLightParamsState(selected ? readSelectedHemisphereLightParams(selected) : null);
    setRectAreaLightParamsState(selected ? readSelectedRectAreaLightParams(selected) : null);
    setDirectionalLightShadowState(selected ? readSelectedDirectionalLightShadow(selected) : null);
    setSpotLightShadowState(selected ? readSelectedSpotLightShadow(selected) : null);
    setPointLightShadowState(selected ? readSelectedPointLightShadow(selected) : null);
    lightColorHistoryBaseRef.current = selectedLightColor?.color?.toLowerCase() ?? null;

    const off = editor.on('select', ({ object }) => {
      if (!object) {
        setSelectedInfo(null);
        setTransform(null);
        setShadow(null);
        setVisibilityPickFreeze(null);
        setOpacityState(null);
        setRenderOrderState(null);
        setPerspectiveCameraParamsState(null);
        setOrthographicCameraParamsState(null);
        setLightColorState(null);
        setLightIntensityState(null);
        setDirectionalLightTargetState(null);
        setSpotLightParamsState(null);
        setPointLightParamsState(null);
        setHemisphereLightParamsState(null);
        setRectAreaLightParamsState(null);
        setDirectionalLightShadowState(null);
        setSpotLightShadowState(null);
        setPointLightShadowState(null);
        lightColorHistoryBaseRef.current = null;
        return;
      }
      setSelectedInfo({
        uuid: object.uuid,
        type: String(object.type ?? 'Object'),
        name: String(object.name ?? '')
      });
      setTransform(readSelectedTransform(object));
      setShadow(readSelectedShadow(object));
      setVisibilityPickFreeze(readSelectedVisibilityPickFreeze(object));
      setOpacityState(readSelectedOpacity(object));
      setRenderOrderState(readSelectedRenderOrder(object));
      setPerspectiveCameraParamsState(readSelectedPerspectiveCameraParams(object));
      setOrthographicCameraParamsState(readSelectedOrthographicCameraParams(object));
      const nextLightColor = readSelectedLightColor(object);
      setLightColorState(nextLightColor);
      setLightIntensityState(readSelectedLightIntensity(object));
      setDirectionalLightTargetState(readSelectedDirectionalLightTarget(object));
      setSpotLightParamsState(readSelectedSpotLightParams(object));
      setPointLightParamsState(readSelectedPointLightParams(object));
      setHemisphereLightParamsState(readSelectedHemisphereLightParams(object));
      setRectAreaLightParamsState(readSelectedRectAreaLightParams(object));
      setDirectionalLightShadowState(readSelectedDirectionalLightShadow(object));
      setSpotLightShadowState(readSelectedSpotLightShadow(object));
      setPointLightShadowState(readSelectedPointLightShadow(object));
      // 防御：切换灯光类型时强制清理其他 shadow state，避免旧状态残留造成面板“混合显示”。
      if ((object as any)?.isDirectionalLight) {
        setSpotLightShadowState(null);
        setPointLightShadowState(null);
      } else if ((object as any)?.isSpotLight) {
        setDirectionalLightShadowState(null);
        setPointLightShadowState(null);
      } else if ((object as any)?.isPointLight) {
        setDirectionalLightShadowState(null);
        setSpotLightShadowState(null);
      } else {
        setDirectionalLightShadowState(null);
        setSpotLightShadowState(null);
        setPointLightShadowState(null);
      }
      lightColorHistoryBaseRef.current = nextLightColor?.color?.toLowerCase() ?? null;
    });

    return off;
  }, [editor]);

  // 当场景树变化时（如从结构树重命名），刷新选中对象的基础信息
  useEffect(() => {
    if (!editor) return;
    const off = editor.on('sceneTreeChange', () => {
      const selected = editor.getSelected();
      if (!selected) return;
      setSelectedInfo((prev) => {
        if (!prev || prev.uuid !== selected.uuid) return prev;
        const nextName = String(selected.name ?? '');
        if (prev.name === nextName) return prev;
        return { ...prev, name: nextName };
      });
    });
    return off;
  }, [editor]);

  // TransformControls 拖拽/旋转/缩放时，three 对象会持续变化；
  // 但本面板原先只在 `select` 变化时 setTransform，因此需要监听 gizmo 的 change/objectChange 事件做实时同步。
  useEffect(() => {
    if (!editor || !selectedInfo?.uuid) return;

    const refreshFromObject = () => {
      const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
      if (!obj) return;
      // 如果 TransformControls 当前挂载的对象已换掉，则跳过，避免旧回调覆盖新选中。
      const attachedObj = (editor.transform as any)?.object as any;
      const attachedUuid = attachedObj?.uuid as string | undefined;
      const attachedLightUuid = attachedObj?.userData?.[LIGHT_TARGET_LIGHT_UUID_KEY] as string | undefined;
      const attachedToCurrentSelected =
        !attachedUuid || attachedUuid === selectedInfo.uuid || attachedLightUuid === selectedInfo.uuid;
      if (!attachedToCurrentSelected) return;
      setTransform(readSelectedTransform(obj));
      setShadow(readSelectedShadow(obj));
      // 这些属性不涉及昂贵材质遍历，跟随 dragging/changing 实时刷新没问题
      setVisibilityPickFreeze(readSelectedVisibilityPickFreeze(obj));
      setRenderOrderState(readSelectedRenderOrder(obj));
      setLightColorState(readSelectedLightColor(obj));
      setLightIntensityState(readSelectedLightIntensity(obj));
      setDirectionalLightTargetState(readSelectedDirectionalLightTarget(obj));
      setSpotLightParamsState(readSelectedSpotLightParams(obj));
      setPointLightParamsState(readSelectedPointLightParams(obj));
      setHemisphereLightParamsState(readSelectedHemisphereLightParams(obj));
      setRectAreaLightParamsState(readSelectedRectAreaLightParams(obj));
      setDirectionalLightShadowState(readSelectedDirectionalLightShadow(obj));
      setSpotLightShadowState(readSelectedSpotLightShadow(obj));
      setPointLightShadowState(readSelectedPointLightShadow(obj));
    };

    // 立即刷新一次，确保选中刚切换时是最新值
    refreshFromObject();

    const transformControls = editor.transform as any;
    transformControls.addEventListener?.('objectChange', refreshFromObject);
    transformControls.addEventListener?.('change', refreshFromObject);

    return () => {
      transformControls.removeEventListener?.('objectChange', refreshFromObject);
      transformControls.removeEventListener?.('change', refreshFromObject);
    };
  }, [editor, selectedInfo?.uuid]);

  const labels = useMemo(() => t.propertiesSettings, [t.propertiesSettings]);
  const historyCategory = useMemo(() => getHistoryCategoryI18n(selectedInfo?.type), [selectedInfo?.type]);

  const showObjectAttributes = useMemo(() => {
    if (!editor || !selectedInfo?.uuid) return false;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    const key = obj?.userData?.[VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_MODEL_KEY];
    return typeof key === 'string' && BASIC_MODEL_KEYS.has(key);
  }, [editor, selectedInfo?.uuid]);

  const onNamePreviewChange = (nextName: string) => {
    if (!editor || !selectedInfo) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'name', nextName, { recordHistory: false });
    setSelectedInfo({ ...selectedInfo, name: nextName });
  };

  const onNameCommit = (nextName: string) => {
    if (!editor || !selectedInfo) return;
    const displayValue = nextName || '""';
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'name', nextName, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.nameLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.nameLabel} = ${displayValue}`
      )
    });
  };

  const copyUuid = async () => {
    if (!selectedInfo?.uuid) return;

    const ok = await copyToClipboard(selectedInfo.uuid);
    if (!ok) {
      void message.error(labels.copyFailedLabel);
      return;
    }
    void message.success(labels.copiedLabel);
  };

  const previewPositionAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo || !transform) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `position.${axis}`, next, { recordHistory: false });
    setTransform((prev) => (prev ? { ...prev, position: { ...prev.position, [axis]: next } } : prev));
  };

  const commitPositionAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo || !transform) return;
    const nextPos = { ...transform.position, [axis]: next };
    const displayValue = `(${Number(nextPos.x.toFixed(4))}, ${Number(nextPos.y.toFixed(4))}, ${Number(nextPos.z.toFixed(4))})`;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `position.${axis}`, next, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.positionLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.positionLabel} = ${displayValue}`
      )
    });
  };

  const previewRotationAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo || !transform) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `rotation.${axis}`, next, { recordHistory: false });
    setTransform((prev) => (prev ? { ...prev, rotation: { ...prev.rotation, [axis]: next } } : prev));
  };

  const commitRotationAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo || !transform) return;
    const nextRot = { ...transform.rotation, [axis]: next };
    const displayValue = `(${Number(nextRot.x.toFixed(4))}, ${Number(nextRot.y.toFixed(4))}, ${Number(nextRot.z.toFixed(4))})`;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `rotation.${axis}`, next, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.rotationLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.rotationLabel} = ${displayValue}`
      )
    });
  };

  const previewScaleAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo || !transform) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `scale.${axis}`, next, { recordHistory: false });
    setTransform((prev) => (prev ? { ...prev, scale: { ...prev.scale, [axis]: next } } : prev));
  };

  const commitScaleAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo || !transform) return;
    const nextScale = { ...transform.scale, [axis]: next };
    const displayValue = `(${Number(nextScale.x.toFixed(4))}, ${Number(nextScale.y.toFixed(4))}, ${Number(nextScale.z.toFixed(4))})`;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `scale.${axis}`, next, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.scaleLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.scaleLabel} = ${displayValue}`
      )
    });
  };

  const setVisible = (nextVisible: boolean) => {
    if (!editor || !selectedInfo) return;
    const v = boolTextI18n(nextVisible);
    const ok = editor.setObjectVisibleByUuid(selectedInfo.uuid, nextVisible, {
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.visibleLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.visibleLabel} = ${v.en}`
      )
    });
    if (!ok) return;
    // 若 nextVisible=false 触发 select(null)，上面的 select 回调会把 state 清空；这里乐观更新即可。
    setVisibilityPickFreeze((prev) => (prev ? { ...prev, visible: nextVisible } : prev));
  };

  const setPickable = (nextPickable: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    const canPickable = !hasNonSelectableAncestor(obj);
    if (!canPickable) return;

    const v = boolTextI18n(nextPickable);
    const prevUserData = { ...(obj.userData ?? {}) };
    const applyPickable = (next: boolean) => {
      if (next) {
        if (obj.userData) {
          delete obj.userData[VIZON_USER_DATA_KEYS.COMMON.NON_PICKABLE];
        }
      } else {
        obj.userData = obj.userData ?? {};
        obj.userData[VIZON_USER_DATA_KEYS.COMMON.NON_PICKABLE] = true;
      }
      setVisibilityPickFreeze(readSelectedVisibilityPickFreeze(obj));
      editor.render();
    };
    void editor.executeHistoryOperation({
      name: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.pickableLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.pickableLabel} = ${v.en}`
      ),
      do: () => applyPickable(nextPickable),
      undo: () => {
        obj.userData = { ...prevUserData };
        setVisibilityPickFreeze(readSelectedVisibilityPickFreeze(obj));
        editor.render();
      }
    });
  };

  const setFrozen = (nextFrozen: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;

    if (!computeFreezeCapability(obj)) return;

    const v = boolTextI18n(nextFrozen);
    const prevUserData = { ...(obj.userData ?? {}) };
    const prevStates: Array<{ node: any; matrixAutoUpdate: boolean }> = [];
    obj.traverse((node: any) => {
      prevStates.push({ node, matrixAutoUpdate: Boolean(node.matrixAutoUpdate) });
    });
    const applyFrozen = (next: boolean) => {
      if (next) {
        if (obj.userData) delete obj.userData[VIZON_USER_DATA_KEYS.COMMON.DYNAMIC];
        obj.traverse((node: any) => {
          if ((node as any)?.isCamera) return;
          if ((node as any)?.isLight) return;
          if ((node as any)?.isBone) return;
          if ((node as any)?.isSkinnedMesh) return;
          if ((node as any)?.isTransformControls) return;
          if (node?.type === 'TransformControlsGizmo' || node?.type === 'TransformControlsPlane') return;
          if (Boolean(node?.userData?.[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE])) return;
          if (Boolean(node?.userData?.[VIZON_USER_DATA_KEYS.COMMON.DYNAMIC])) return;
          node.matrixAutoUpdate = false;
          node.updateMatrix();
          node.updateMatrixWorld(true);
        });
      } else {
        obj.userData = obj.userData ?? {};
        obj.userData[VIZON_USER_DATA_KEYS.COMMON.DYNAMIC] = true;
        obj.traverse((node: any) => {
          node.matrixAutoUpdate = true;
          node.updateMatrixWorld(true);
        });
      }
      setVisibilityPickFreeze(readSelectedVisibilityPickFreeze(obj));
      editor.render();
    };
    void editor.executeHistoryOperation({
      name: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.freezeLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.freezeLabel} = ${v.en}`
      ),
      do: () => applyFrozen(nextFrozen),
      undo: () => {
        obj.userData = { ...prevUserData };
        for (const item of prevStates) {
          item.node.matrixAutoUpdate = item.matrixAutoUpdate;
          item.node.updateMatrixWorld?.(true);
        }
        setVisibilityPickFreeze(readSelectedVisibilityPickFreeze(obj));
        editor.render();
      }
    });
  };

  const previewOpacity = (nextOpacity: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;

    const materials = getObjectMaterials(obj);
    if (materials.length === 0) return;

    const clamped = Math.max(0, Math.min(1, nextOpacity));
    for (const m of materials) {
      m.transparent = clamped < 1;
      m.opacity = clamped;
      m.needsUpdate = true;
    }
    setOpacityState({ opacity: clamped, canOpacity: true });
    editor.render();
  };

  const commitOpacity = (nextOpacity: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    const materials = getObjectMaterials(obj);
    if (materials.length === 0) return;
    const clamped = Math.max(0, Math.min(1, nextOpacity));
    const displayValue = Number(clamped.toFixed(4));
    const before = materials.map((m) => ({ m, opacity: m.opacity, transparent: m.transparent }));
    void editor.executeHistoryOperation({
      name: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.opacityLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.opacityLabel} = ${displayValue}`
      ),
      do: () => {
        for (const m of materials) {
          m.transparent = clamped < 1;
          m.opacity = clamped;
          m.needsUpdate = true;
        }
        setOpacityState({ opacity: clamped, canOpacity: true });
        editor.render();
      },
      undo: () => {
        for (const item of before) {
          item.m.opacity = item.opacity;
          item.m.transparent = item.transparent;
          item.m.needsUpdate = true;
        }
        setOpacityState({ opacity: before[0]?.opacity ?? clamped, canOpacity: true });
        editor.render();
      }
    });
  };

  const previewRenderOrder = (nextRenderOrder: number) => {
    if (!editor || !selectedInfo) return;
    const next = Math.max(0, Math.min(999, Math.round(nextRenderOrder)));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'renderOrder', next, { recordHistory: false });
    setRenderOrderState({ renderOrder: next, canRenderOrder: true });
  };

  const commitRenderOrder = (nextRenderOrder: number) => {
    if (!editor || !selectedInfo) return;
    const next = Math.max(0, Math.min(999, Math.round(nextRenderOrder)));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'renderOrder', next, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.renderOrderLabel} = ${next}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.renderOrderLabel} = ${next}`
      )
    });
    setRenderOrderState({ renderOrder: next, canRenderOrder: true });
  };

  const previewPerspectiveCameraNumber = (path: 'fov' | 'near' | 'far' | 'zoom', nextValue: number) => {
    setPerspectiveCameraParamsState((prev) => (prev ? { ...prev, [path]: nextValue } : prev));
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isPerspectiveCamera) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, Number(nextValue), { recordHistory: false });
  };

  const commitPerspectiveCameraNumber = (path: 'fov' | 'near' | 'far' | 'zoom', nextValue: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isPerspectiveCamera) return;
    const normalizedValue = Number(nextValue);
    if (!Number.isFinite(normalizedValue)) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, normalizedValue, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${path} = ${normalizedValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${path} = ${normalizedValue}`
      )
    });
    setPerspectiveCameraParamsState((prev) => (prev ? { ...prev, [path]: normalizedValue } : prev));
  };

  const previewOrthographicCameraNumber = (
    path: 'left' | 'right' | 'top' | 'bottom' | 'near' | 'far' | 'zoom',
    nextValue: number
  ) => {
    setOrthographicCameraParamsState((prev) => (prev ? { ...prev, [path]: nextValue } : prev));
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isOrthographicCamera) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, Number(nextValue), { recordHistory: false });
  };

  const commitOrthographicCameraNumber = (
    path: 'left' | 'right' | 'top' | 'bottom' | 'near' | 'far' | 'zoom',
    nextValue: number
  ) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isOrthographicCamera) return;
    const normalizedValue = Number(nextValue);
    if (!Number.isFinite(normalizedValue)) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, normalizedValue, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${path} = ${normalizedValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${path} = ${normalizedValue}`
      )
    });
    setOrthographicCameraParamsState((prev) => (prev ? { ...prev, [path]: normalizedValue } : prev));
  };

  const setCastShadow = (nextCastShadow: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    if (typeof (obj as any).castShadow !== 'boolean') return;
    const v = boolTextI18n(nextCastShadow);
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'castShadow', nextCastShadow, {
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.castShadowLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.castShadowLabel} = ${v.en}`
      )
    });
    setShadow((prev) => (prev ? { ...prev, castShadow: nextCastShadow, canCastShadow: true } : prev));
  };

  const setReceiveShadow = (nextReceiveShadow: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    if (typeof (obj as any).receiveShadow !== 'boolean') return;
    const v = boolTextI18n(nextReceiveShadow);
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'receiveShadow', nextReceiveShadow, {
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.receiveShadowLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.receiveShadowLabel} = ${v.en}`
      )
    });
    setShadow((prev) => (prev ? { ...prev, receiveShadow: nextReceiveShadow, canReceiveShadow: true } : prev));
  };

  const setFrustumCulled = (nextFrustumCulled: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    if (typeof (obj as any).frustumCulled !== 'boolean') return;
    const v = boolTextI18n(nextFrustumCulled);
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'frustumCulled', nextFrustumCulled, {
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.frustumCulledLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.frustumCulledLabel} = ${v.en}`
      )
    });
    setShadow((prev) => (prev ? { ...prev, frustumCulled: nextFrustumCulled, canFrustumCulled: true } : prev));
  };

  const previewLightColor = (nextColor: string) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isLight || !obj?.color || typeof obj.color.getHexString !== 'function') return;
    const normalizedNext = nextColor.startsWith('#') ? nextColor : `#${nextColor}`;
    obj.color.set(normalizedNext);
    setLightColorState({ color: normalizedNext.toLowerCase(), canColor: true });
    editor.render();
  };

  const commitLightColor = (nextColor: string) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isLight || !obj?.color || typeof obj.color.getHexString !== 'function') return;
    const normalizedNext = (nextColor.startsWith('#') ? nextColor : `#${nextColor}`).toLowerCase();
    const beforeColor = lightColorHistoryBaseRef.current?.toLowerCase();
    if (!beforeColor || beforeColor === normalizedNext) return;
    void editor.executeHistoryOperation({
      name: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.colorLabel} = ${normalizedNext}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.colorLabel} = ${normalizedNext}`
      ),
      do: () => {
        obj.color.set(normalizedNext);
        setLightColorState({ color: normalizedNext.toLowerCase(), canColor: true });
        lightColorHistoryBaseRef.current = normalizedNext.toLowerCase();
        editor.render();
      },
      undo: () => {
        obj.color.set(beforeColor);
        setLightColorState({ color: beforeColor, canColor: true });
        lightColorHistoryBaseRef.current = beforeColor;
        editor.render();
      }
    });
  };

  const previewLightIntensity = (nextIntensity: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isLight || typeof obj.intensity !== 'number') return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'intensity', nextIntensity, { recordHistory: false });
    setLightIntensityState({ intensity: nextIntensity, canIntensity: true });
  };

  const commitLightIntensity = (nextIntensity: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isLight || typeof obj.intensity !== 'number') return;
    const displayValue = Number(nextIntensity.toFixed(4));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'intensity', nextIntensity, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.lightIntensityLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.lightIntensityLabel} = ${displayValue}`
      )
    });
    setLightIntensityState({ intensity: nextIntensity, canIntensity: true });
  };

  const previewDirectionalTargetAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isDirectionalLight || !obj?.target) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `target.position.${axis}`, next, { recordHistory: false });
    setDirectionalLightTargetState((prev) => (prev ? { ...prev, target: { ...prev.target, [axis]: next } } : prev));
  };

  const commitDirectionalTargetAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isDirectionalLight || !obj?.target) return;
    const displayValue = Number(next.toFixed(4));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `target.position.${axis}`, next, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.lightTargetLabel} ${axis.toUpperCase()} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.lightTargetLabel} ${axis.toUpperCase()} = ${displayValue}`
      )
    });
    setDirectionalLightTargetState((prev) => (prev ? { ...prev, target: { ...prev.target, [axis]: next } } : prev));
  };

  const previewSpotParamNumber = (
    path: 'distance' | 'angle' | 'penumbra' | 'decay' | 'focus',
    nextValue: number
  ) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isSpotLight) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, nextValue, { recordHistory: false });
    setSpotLightParamsState((prev) => (prev ? { ...prev, [path]: nextValue } : prev));
  };

  const commitSpotParamNumber = (
    path: 'distance' | 'angle' | 'penumbra' | 'decay' | 'focus',
    nextValue: number
  ) => {
    if (!editor || !selectedInfo) return;
    const labelMap = {
      distance: { zh: LABELS_ZH.lightDistanceLabel, en: LABELS_EN.lightDistanceLabel },
      angle: { zh: LABELS_ZH.spotAngleLabel, en: LABELS_EN.spotAngleLabel },
      penumbra: { zh: LABELS_ZH.spotPenumbraLabel, en: LABELS_EN.spotPenumbraLabel },
      decay: { zh: LABELS_ZH.lightDecayLabel, en: LABELS_EN.lightDecayLabel },
      focus: { zh: LABELS_ZH.spotFocusLabel, en: LABELS_EN.spotFocusLabel }
    } as const;
    const displayValue = Number(nextValue.toFixed(6));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, nextValue, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelMap[path].zh} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelMap[path].en} = ${displayValue}`
      )
    });
    setSpotLightParamsState((prev) => (prev ? { ...prev, [path]: nextValue } : prev));
  };

  const previewSpotTargetAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isSpotLight || !obj?.target) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `target.position.${axis}`, next, { recordHistory: false });
    setSpotLightParamsState((prev) => (prev ? { ...prev, target: { ...prev.target, [axis]: next } } : prev));
  };

  const commitSpotTargetAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isSpotLight || !obj?.target) return;
    const displayValue = Number(next.toFixed(4));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `target.position.${axis}`, next, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.lightTargetLabel} ${axis.toUpperCase()} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.lightTargetLabel} ${axis.toUpperCase()} = ${displayValue}`
      )
    });
    setSpotLightParamsState((prev) => (prev ? { ...prev, target: { ...prev.target, [axis]: next } } : prev));
  };

  const previewPointParamNumber = (path: 'distance' | 'decay', nextValue: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isPointLight) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, nextValue, { recordHistory: false });
    setPointLightParamsState((prev) => (prev ? { ...prev, [path]: nextValue } : prev));
  };

  const commitPointParamNumber = (path: 'distance' | 'decay', nextValue: number) => {
    if (!editor || !selectedInfo) return;
    const labelMap = {
      distance: { zh: LABELS_ZH.lightDistanceLabel, en: LABELS_EN.lightDistanceLabel },
      decay: { zh: LABELS_ZH.lightDecayLabel, en: LABELS_EN.lightDecayLabel }
    } as const;
    const displayValue = Number(nextValue.toFixed(6));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, nextValue, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelMap[path].zh} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelMap[path].en} = ${displayValue}`
      )
    });
    setPointLightParamsState((prev) => (prev ? { ...prev, [path]: nextValue } : prev));
  };

  const previewHemisphereGroundColor = (nextColor: string) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isHemisphereLight || !obj?.groundColor) return;
    const normalizedNext = nextColor.startsWith('#') ? nextColor : `#${nextColor}`;
    obj.groundColor.set(normalizedNext);
    setHemisphereLightParamsState({ groundColor: normalizedNext.toLowerCase(), canEdit: true });
    editor.render();
  };

  const commitHemisphereGroundColor = (nextColor: string) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isHemisphereLight || !obj?.groundColor) return;
    const normalizedNext = (nextColor.startsWith('#') ? nextColor : `#${nextColor}`).toLowerCase();
    const before = hemisphereLightParamsState?.groundColor?.toLowerCase();
    if (!before || before === normalizedNext) return;
    void editor.executeHistoryOperation({
      name: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.hemisphereGroundColorLabel} = ${normalizedNext}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.hemisphereGroundColorLabel} = ${normalizedNext}`
      ),
      do: () => {
        obj.groundColor.set(normalizedNext);
        setHemisphereLightParamsState({ groundColor: normalizedNext.toLowerCase(), canEdit: true });
        editor.render();
      },
      undo: () => {
        obj.groundColor.set(before);
        setHemisphereLightParamsState({ groundColor: before, canEdit: true });
        editor.render();
      }
    });
  };

  const previewRectAreaParamNumber = (path: 'width' | 'height', nextValue: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isRectAreaLight) return;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, nextValue, { recordHistory: false });
    setRectAreaLightParamsState((prev) => (prev ? { ...prev, [path]: nextValue } : prev));
  };

  const commitRectAreaParamNumber = (path: 'width' | 'height', nextValue: number) => {
    if (!editor || !selectedInfo) return;
    const labelMap = {
      width: { zh: LABELS_ZH.rectAreaWidthLabel, en: LABELS_EN.rectAreaWidthLabel },
      height: { zh: LABELS_ZH.rectAreaHeightLabel, en: LABELS_EN.rectAreaHeightLabel }
    } as const;
    const displayValue = Number(nextValue.toFixed(6));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, nextValue, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelMap[path].zh} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelMap[path].en} = ${displayValue}`
      )
    });
    setRectAreaLightParamsState((prev) => (prev ? { ...prev, [path]: nextValue } : prev));
  };

  const previewRectAreaTargetAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isRectAreaLight) return;
    const prevTarget = rectAreaLightParamsState?.target ?? { x: 0, y: 0, z: 0 };
    const nextTarget = { ...prevTarget, [axis]: next };
    obj.userData = obj.userData ?? {};
    obj.userData[RECT_AREA_LIGHT_TARGET_KEY] = nextTarget;
    obj.lookAt(nextTarget.x, nextTarget.y, nextTarget.z);
    setRectAreaLightParamsState((prev) => (prev ? { ...prev, target: nextTarget } : prev));
    editor.render();
  };

  const commitRectAreaTargetAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isRectAreaLight) return;
    const beforeTarget = rectAreaLightParamsState?.target ?? { x: 0, y: 0, z: 0 };
    const beforeQuat = obj.quaternion.clone?.();
    const beforeUd = { ...(obj.userData ?? {}) };
    const nextTarget = { ...beforeTarget, [axis]: next };
    const displayValue = Number(next.toFixed(4));
    void editor.executeHistoryOperation({
      name: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.lightTargetLabel} ${axis.toUpperCase()} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.lightTargetLabel} ${axis.toUpperCase()} = ${displayValue}`
      ),
      do: () => {
        obj.userData = obj.userData ?? {};
        obj.userData[RECT_AREA_LIGHT_TARGET_KEY] = nextTarget;
        obj.lookAt(nextTarget.x, nextTarget.y, nextTarget.z);
        setRectAreaLightParamsState((prev) => (prev ? { ...prev, target: nextTarget } : prev));
        editor.render();
      },
      undo: () => {
        obj.userData = { ...beforeUd };
        if (beforeQuat && obj.quaternion?.copy) obj.quaternion.copy(beforeQuat);
        setRectAreaLightParamsState(readSelectedRectAreaLightParams(obj));
        editor.render();
      }
    });
  };

  const previewDirectionalShadowNumber = (
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
  ) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isDirectionalLight || !obj.shadow) return;
    const normalizedValue =
      path === 'shadow.mapSize.width' || path === 'shadow.mapSize.height'
        ? Math.max(1, Math.min(8192, Math.round(nextValue)))
        : nextValue;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, normalizedValue, { recordHistory: false });
    setDirectionalLightShadowState((prev) => {
      if (!prev) return prev;
      if (path === 'shadow.intensity') return { ...prev, intensity: normalizedValue };
      if (path === 'shadow.bias') return { ...prev, bias: normalizedValue };
      if (path === 'shadow.normalBias') return { ...prev, normalBias: normalizedValue };
      if (path === 'shadow.radius') return { ...prev, radius: normalizedValue };
      if (path === 'shadow.mapSize.width') return { ...prev, mapSizeWidth: normalizedValue };
      if (path === 'shadow.mapSize.height') return { ...prev, mapSizeHeight: normalizedValue };
      if (path === 'shadow.camera.left') return { ...prev, left: normalizedValue };
      if (path === 'shadow.camera.right') return { ...prev, right: normalizedValue };
      if (path === 'shadow.camera.top') return { ...prev, top: normalizedValue };
      if (path === 'shadow.camera.bottom') return { ...prev, bottom: normalizedValue };
      if (path === 'shadow.camera.near') return { ...prev, near: normalizedValue };
      return { ...prev, far: normalizedValue };
    });
  };

  const commitDirectionalShadowNumber = (
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
  ) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isDirectionalLight || !obj.shadow) return;
    const normalizedValue =
      path === 'shadow.mapSize.width' || path === 'shadow.mapSize.height'
        ? Math.max(1, Math.min(8192, Math.round(nextValue)))
        : nextValue;
    const labelMap = {
      'shadow.intensity': { zh: LABELS_ZH.shadowIntensityLabel, en: LABELS_EN.shadowIntensityLabel },
      'shadow.bias': { zh: LABELS_ZH.shadowBiasLabel, en: LABELS_EN.shadowBiasLabel },
      'shadow.normalBias': { zh: LABELS_ZH.shadowNormalBiasLabel, en: LABELS_EN.shadowNormalBiasLabel },
      'shadow.radius': { zh: LABELS_ZH.shadowRadiusLabel, en: LABELS_EN.shadowRadiusLabel },
      'shadow.mapSize.width': { zh: LABELS_ZH.shadowMapSizeWidthLabel, en: LABELS_EN.shadowMapSizeWidthLabel },
      'shadow.mapSize.height': { zh: LABELS_ZH.shadowMapSizeHeightLabel, en: LABELS_EN.shadowMapSizeHeightLabel },
      'shadow.camera.left': { zh: LABELS_ZH.shadowCameraLeftLabel, en: LABELS_EN.shadowCameraLeftLabel },
      'shadow.camera.right': { zh: LABELS_ZH.shadowCameraRightLabel, en: LABELS_EN.shadowCameraRightLabel },
      'shadow.camera.top': { zh: LABELS_ZH.shadowCameraTopLabel, en: LABELS_EN.shadowCameraTopLabel },
      'shadow.camera.bottom': { zh: LABELS_ZH.shadowCameraBottomLabel, en: LABELS_EN.shadowCameraBottomLabel },
      'shadow.camera.near': { zh: LABELS_ZH.shadowCameraNearLabel, en: LABELS_EN.shadowCameraNearLabel },
      'shadow.camera.far': { zh: LABELS_ZH.shadowCameraFarLabel, en: LABELS_EN.shadowCameraFarLabel }
    } as const;
    const displayValue = Number(normalizedValue.toFixed(6));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, normalizedValue, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelMap[path].zh} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelMap[path].en} = ${displayValue}`
      )
    });
    setDirectionalLightShadowState((prev) => {
      if (!prev) return prev;
      if (path === 'shadow.intensity') return { ...prev, intensity: normalizedValue };
      if (path === 'shadow.bias') return { ...prev, bias: normalizedValue };
      if (path === 'shadow.normalBias') return { ...prev, normalBias: normalizedValue };
      if (path === 'shadow.radius') return { ...prev, radius: normalizedValue };
      if (path === 'shadow.mapSize.width') return { ...prev, mapSizeWidth: normalizedValue };
      if (path === 'shadow.mapSize.height') return { ...prev, mapSizeHeight: normalizedValue };
      if (path === 'shadow.camera.left') return { ...prev, left: normalizedValue };
      if (path === 'shadow.camera.right') return { ...prev, right: normalizedValue };
      if (path === 'shadow.camera.top') return { ...prev, top: normalizedValue };
      if (path === 'shadow.camera.bottom') return { ...prev, bottom: normalizedValue };
      if (path === 'shadow.camera.near') return { ...prev, near: normalizedValue };
      return { ...prev, far: normalizedValue };
    });
  };

  const setDirectionalShadowHelperVisible = (nextVisible: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isDirectionalLight) return;
    const v = boolTextI18n(nextVisible);
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `userData.${VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE}`, nextVisible, {
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.shadowHelperVisibleLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.shadowHelperVisibleLabel} = ${v.en}`
      )
    });
    setDirectionalLightShadowState((prev) => (prev ? { ...prev, helperVisible: nextVisible } : prev));
  };

  const previewSpotShadowNumber = (
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
  ) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isSpotLight || !obj.shadow) return;
    const normalizedValue =
      path === 'shadow.mapSize.width' || path === 'shadow.mapSize.height'
        ? Math.max(1, Math.min(8192, Math.round(nextValue)))
        : nextValue;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, normalizedValue, { recordHistory: false });
    setSpotLightShadowState((prev) => {
      if (!prev) return prev;
      if (path === 'shadow.intensity') return { ...prev, intensity: normalizedValue };
      if (path === 'shadow.bias') return { ...prev, bias: normalizedValue };
      if (path === 'shadow.normalBias') return { ...prev, normalBias: normalizedValue };
      if (path === 'shadow.radius') return { ...prev, radius: normalizedValue };
      if (path === 'shadow.mapSize.width') return { ...prev, mapSizeWidth: normalizedValue };
      if (path === 'shadow.mapSize.height') return { ...prev, mapSizeHeight: normalizedValue };
      if (path === 'shadow.camera.near') return { ...prev, near: normalizedValue };
      if (path === 'shadow.camera.far') return { ...prev, far: normalizedValue };
      return { ...prev, fov: normalizedValue };
    });
  };

  const commitSpotShadowNumber = (
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
  ) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isSpotLight || !obj.shadow) return;
    const normalizedValue =
      path === 'shadow.mapSize.width' || path === 'shadow.mapSize.height'
        ? Math.max(1, Math.min(8192, Math.round(nextValue)))
        : nextValue;
    const labelMap = {
      'shadow.intensity': { zh: LABELS_ZH.shadowIntensityLabel, en: LABELS_EN.shadowIntensityLabel },
      'shadow.bias': { zh: LABELS_ZH.shadowBiasLabel, en: LABELS_EN.shadowBiasLabel },
      'shadow.normalBias': { zh: LABELS_ZH.shadowNormalBiasLabel, en: LABELS_EN.shadowNormalBiasLabel },
      'shadow.radius': { zh: LABELS_ZH.shadowRadiusLabel, en: LABELS_EN.shadowRadiusLabel },
      'shadow.mapSize.width': { zh: LABELS_ZH.shadowMapSizeWidthLabel, en: LABELS_EN.shadowMapSizeWidthLabel },
      'shadow.mapSize.height': { zh: LABELS_ZH.shadowMapSizeHeightLabel, en: LABELS_EN.shadowMapSizeHeightLabel },
      'shadow.camera.near': { zh: LABELS_ZH.shadowCameraNearLabel, en: LABELS_EN.shadowCameraNearLabel },
      'shadow.camera.far': { zh: LABELS_ZH.shadowCameraFarLabel, en: LABELS_EN.shadowCameraFarLabel },
      'shadow.camera.fov': { zh: LABELS_ZH.shadowCameraFovLabel, en: LABELS_EN.shadowCameraFovLabel }
    } as const;
    const displayValue = Number(normalizedValue.toFixed(6));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, normalizedValue, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelMap[path].zh} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelMap[path].en} = ${displayValue}`
      )
    });
    setSpotLightShadowState((prev) => {
      if (!prev) return prev;
      if (path === 'shadow.intensity') return { ...prev, intensity: normalizedValue };
      if (path === 'shadow.bias') return { ...prev, bias: normalizedValue };
      if (path === 'shadow.normalBias') return { ...prev, normalBias: normalizedValue };
      if (path === 'shadow.radius') return { ...prev, radius: normalizedValue };
      if (path === 'shadow.mapSize.width') return { ...prev, mapSizeWidth: normalizedValue };
      if (path === 'shadow.mapSize.height') return { ...prev, mapSizeHeight: normalizedValue };
      if (path === 'shadow.camera.near') return { ...prev, near: normalizedValue };
      if (path === 'shadow.camera.far') return { ...prev, far: normalizedValue };
      return { ...prev, fov: normalizedValue };
    });
  };

  const setSpotShadowHelperVisible = (nextVisible: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isSpotLight) return;
    const v = boolTextI18n(nextVisible);
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `userData.${VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE}`, nextVisible, {
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.shadowHelperVisibleLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.shadowHelperVisibleLabel} = ${v.en}`
      )
    });
    setSpotLightShadowState((prev) => (prev ? { ...prev, helperVisible: nextVisible } : prev));
  };

  const previewPointShadowNumber = (
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
  ) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isPointLight || !obj.shadow) return;
    const normalizedValue =
      path === 'shadow.mapSize.width' || path === 'shadow.mapSize.height'
        ? Math.max(1, Math.min(8192, Math.round(nextValue)))
        : nextValue;
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, normalizedValue, { recordHistory: false });
    setPointLightShadowState((prev) => {
      if (!prev) return prev;
      if (path === 'shadow.intensity') return { ...prev, intensity: normalizedValue };
      if (path === 'shadow.bias') return { ...prev, bias: normalizedValue };
      if (path === 'shadow.normalBias') return { ...prev, normalBias: normalizedValue };
      if (path === 'shadow.radius') return { ...prev, radius: normalizedValue };
      if (path === 'shadow.mapSize.width') return { ...prev, mapSizeWidth: normalizedValue };
      if (path === 'shadow.mapSize.height') return { ...prev, mapSizeHeight: normalizedValue };
      if (path === 'shadow.camera.near') return { ...prev, near: normalizedValue };
      return { ...prev, far: normalizedValue };
    });
  };

  const commitPointShadowNumber = (
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
  ) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isPointLight || !obj.shadow) return;
    const normalizedValue =
      path === 'shadow.mapSize.width' || path === 'shadow.mapSize.height'
        ? Math.max(1, Math.min(8192, Math.round(nextValue)))
        : nextValue;
    const labelMap = {
      'shadow.intensity': { zh: LABELS_ZH.shadowIntensityLabel, en: LABELS_EN.shadowIntensityLabel },
      'shadow.bias': { zh: LABELS_ZH.shadowBiasLabel, en: LABELS_EN.shadowBiasLabel },
      'shadow.normalBias': { zh: LABELS_ZH.shadowNormalBiasLabel, en: LABELS_EN.shadowNormalBiasLabel },
      'shadow.radius': { zh: LABELS_ZH.shadowRadiusLabel, en: LABELS_EN.shadowRadiusLabel },
      'shadow.mapSize.width': { zh: LABELS_ZH.shadowMapSizeWidthLabel, en: LABELS_EN.shadowMapSizeWidthLabel },
      'shadow.mapSize.height': { zh: LABELS_ZH.shadowMapSizeHeightLabel, en: LABELS_EN.shadowMapSizeHeightLabel },
      'shadow.camera.near': { zh: LABELS_ZH.shadowCameraNearLabel, en: LABELS_EN.shadowCameraNearLabel },
      'shadow.camera.far': { zh: LABELS_ZH.shadowCameraFarLabel, en: LABELS_EN.shadowCameraFarLabel }
    } as const;
    const displayValue = Number(normalizedValue.toFixed(6));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, path, normalizedValue, {
      recordHistory: true,
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelMap[path].zh} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelMap[path].en} = ${displayValue}`
      )
    });
    setPointLightShadowState((prev) => {
      if (!prev) return prev;
      if (path === 'shadow.intensity') return { ...prev, intensity: normalizedValue };
      if (path === 'shadow.bias') return { ...prev, bias: normalizedValue };
      if (path === 'shadow.normalBias') return { ...prev, normalBias: normalizedValue };
      if (path === 'shadow.radius') return { ...prev, radius: normalizedValue };
      if (path === 'shadow.mapSize.width') return { ...prev, mapSizeWidth: normalizedValue };
      if (path === 'shadow.mapSize.height') return { ...prev, mapSizeHeight: normalizedValue };
      if (path === 'shadow.camera.near') return { ...prev, near: normalizedValue };
      return { ...prev, far: normalizedValue };
    });
  };

  const setPointShadowHelperVisible = (nextVisible: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    if (!obj?.isPointLight) return;
    const v = boolTextI18n(nextVisible);
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, `userData.${VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE}`, nextVisible, {
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${LABELS_ZH.shadowHelperVisibleLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${LABELS_EN.shadowHelperVisibleLabel} = ${v.en}`
      )
    });
    setPointLightShadowState((prev) => (prev ? { ...prev, helperVisible: nextVisible } : prev));
  };

  return (
    <Accordion<'base' | 'object'>
      allowMultiple={true}
      defaultOpenKeys={['base', 'object']}
      items={[
        {
          key: 'base',
          header: labels.baseSettingTitle,
          content: (
            <BaseSetting
              labels={labels}
              selectedInfo={selectedInfo}
              transform={transform}
              shadow={shadow}
              visibilityPickFreeze={visibilityPickFreeze}
              opacityState={opacityState}
              renderOrderState={renderOrderState}
              perspectiveCameraParamsState={perspectiveCameraParamsState}
              orthographicCameraParamsState={orthographicCameraParamsState}
              lightColorState={lightColorState}
              lightIntensityState={lightIntensityState}
              directionalLightTargetState={directionalLightTargetState}
              spotLightParamsState={spotLightParamsState}
              pointLightParamsState={pointLightParamsState}
              hemisphereLightParamsState={hemisphereLightParamsState}
              rectAreaLightParamsState={rectAreaLightParamsState}
              directionalLightShadowState={directionalLightShadowState}
              spotLightShadowState={spotLightShadowState}
              pointLightShadowState={pointLightShadowState}
              onNamePreviewChange={onNamePreviewChange}
              onNameCommit={onNameCommit}
              copyUuid={copyUuid}
              previewPositionAxis={previewPositionAxis}
              commitPositionAxis={commitPositionAxis}
              previewRotationAxis={previewRotationAxis}
              commitRotationAxis={commitRotationAxis}
              previewScaleAxis={previewScaleAxis}
              commitScaleAxis={commitScaleAxis}
              setVisible={setVisible}
              setPickable={setPickable}
              setFrozen={setFrozen}
              previewOpacity={previewOpacity}
              commitOpacity={commitOpacity}
              previewRenderOrder={previewRenderOrder}
              commitRenderOrder={commitRenderOrder}
              previewPerspectiveCameraNumber={previewPerspectiveCameraNumber}
              commitPerspectiveCameraNumber={commitPerspectiveCameraNumber}
              previewOrthographicCameraNumber={previewOrthographicCameraNumber}
              commitOrthographicCameraNumber={commitOrthographicCameraNumber}
              setCastShadow={setCastShadow}
              setReceiveShadow={setReceiveShadow}
              setFrustumCulled={setFrustumCulled}
              previewLightColor={previewLightColor}
              commitLightColor={commitLightColor}
              previewLightIntensity={previewLightIntensity}
              commitLightIntensity={commitLightIntensity}
              previewDirectionalTargetAxis={previewDirectionalTargetAxis}
              commitDirectionalTargetAxis={commitDirectionalTargetAxis}
              previewSpotParamNumber={previewSpotParamNumber}
              commitSpotParamNumber={commitSpotParamNumber}
              previewSpotTargetAxis={previewSpotTargetAxis}
              commitSpotTargetAxis={commitSpotTargetAxis}
              previewPointParamNumber={previewPointParamNumber}
              commitPointParamNumber={commitPointParamNumber}
              previewHemisphereGroundColor={previewHemisphereGroundColor}
              commitHemisphereGroundColor={commitHemisphereGroundColor}
              previewRectAreaParamNumber={previewRectAreaParamNumber}
              commitRectAreaParamNumber={commitRectAreaParamNumber}
              previewRectAreaTargetAxis={previewRectAreaTargetAxis}
              commitRectAreaTargetAxis={commitRectAreaTargetAxis}
              previewDirectionalShadowNumber={previewDirectionalShadowNumber}
              commitDirectionalShadowNumber={commitDirectionalShadowNumber}
              setDirectionalShadowHelperVisible={setDirectionalShadowHelperVisible}
              previewSpotShadowNumber={previewSpotShadowNumber}
              commitSpotShadowNumber={commitSpotShadowNumber}
              setSpotShadowHelperVisible={setSpotShadowHelperVisible}
              previewPointShadowNumber={previewPointShadowNumber}
              commitPointShadowNumber={commitPointShadowNumber}
              setPointShadowHelperVisible={setPointShadowHelperVisible}
            />
          )
        },
        ...(showObjectAttributes
          ? [
            {
              key: 'object' as const,
              header: t.objectAttributes.header,
              content: <ObjectAttributes editor={editor} selectedInfo={selectedInfo} />
            }
          ]
          : [])
      ]}
    />
  );
}

