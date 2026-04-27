import { useEffect, useMemo, useState } from 'react';

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

/** 内置基础模型 key 集合，用于判断当前对象是否支持参数化几何属性编辑 */
const BASIC_MODEL_KEYS = new Set(basicModels.map((m) => m.key));

/** 三维坐标轴 key */
type AxisKey = 'x' | 'y' | 'z';

type Vec3 = {
  x: number;
  y: number;
  z: number;
};

type TransformState = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

type ShadowState = {
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  canCastShadow: boolean;
  canReceiveShadow: boolean;
  canFrustumCulled: boolean;
};

type VisibilityPickFreezeState = {
  visible: boolean;
  pickable: boolean;
  frozen: boolean;
  canPickable: boolean;
  canFreeze: boolean;
};

type OpacityState = {
  opacity: number;
  canOpacity: boolean;
};

type RenderOrderState = {
  renderOrder: number;
  canRenderOrder: boolean;
};

type SelectedObjectInfo = {
  uuid: string;
  type: string;
  name: string;
} | null;

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

/**
 * 根据 three 对象类型推导历史记录分类前缀，
 * 让属性修改在撤销/重做面板中更易识别。
 */
function getHistoryCategoryByObjectType(type?: string): string {
  if (!type) return '修改物体属性';
  if (type === 'OrthographicCamera') return '修改正交相机属性';
  if (type === 'PerspectiveCamera') return '修改透视相机属性';
  if (type.endsWith('Camera')) return '修改相机属性';
  if (type === 'DirectionalLight') return '修改平行光属性';
  if (type === 'PointLight') return '修改点光源属性';
  if (type === 'SpotLight') return '修改聚光灯属性';
  if (type === 'AmbientLight') return '修改环境光属性';
  if (type === 'HemisphereLight') return '修改半球光属性';
  if (type === 'RectAreaLight') return '修改矩形光属性';
  if (type.endsWith('Light')) return '修改灯光属性';
  return '修改物体属性';
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

  const canCastShadow = typeof (obj as any).castShadow === 'boolean';
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

/** 判断对象及其祖先中是否存在“不可选择”标记 */
function computeIsNonSelectableInHierarchy(obj: any): boolean {
  let cur: any = obj;
  while (cur) {
    if (Boolean(cur?.userData?.[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE])) return true;
    cur = cur.parent;
  }
  return false;
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

  useEffect(() => {
    if (!editor) return;

    const selected = editor.getSelected();
    setSelectedInfo(readSelectedInfo(selected));
    setTransform(selected ? readSelectedTransform(selected) : null);
    setShadow(selected ? readSelectedShadow(selected) : null);
    setVisibilityPickFreeze(selected ? readSelectedVisibilityPickFreeze(selected) : null);
    setOpacityState(selected ? readSelectedOpacity(selected) : null);
    setRenderOrderState(selected ? readSelectedRenderOrder(selected) : null);

    const off = editor.on('select', ({ object }) => {
      if (!object) {
        setSelectedInfo(null);
        setTransform(null);
        setShadow(null);
        setVisibilityPickFreeze(null);
        setOpacityState(null);
        setRenderOrderState(null);
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
      const attachedUuid = (editor.transform as any)?.object?.uuid;
      if (attachedUuid && attachedUuid !== selectedInfo.uuid) return;
      setTransform(readSelectedTransform(obj));
      setShadow(readSelectedShadow(obj));
      // 这些属性不涉及昂贵材质遍历，跟随 dragging/changing 实时刷新没问题
      setVisibilityPickFreeze(readSelectedVisibilityPickFreeze(obj));
      setRenderOrderState(readSelectedRenderOrder(obj));
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
  const labelsZh = appMessages['zh-CN'].designPage.inspector.propertiesSettings;
  const labelsEn = appMessages['en-US'].designPage.inspector.propertiesSettings;
  const historyName = (zhName: string, enName: string) =>
    encodeHistoryI18nName({ 'zh-CN': zhName, 'en-US': enName });
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
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.nameLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.nameLabel} = ${displayValue}`
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
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.positionLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.positionLabel} = ${displayValue}`
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
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.rotationLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.rotationLabel} = ${displayValue}`
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
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.scaleLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.scaleLabel} = ${displayValue}`
      )
    });
  };

  const setVisible = (nextVisible: boolean) => {
    if (!editor || !selectedInfo) return;
    const v = boolTextI18n(nextVisible);
    const ok = editor.setObjectVisibleByUuid(selectedInfo.uuid, nextVisible, {
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.visibleLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.visibleLabel} = ${v.en}`
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
          delete obj.userData[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE];
        }
      } else {
        obj.userData = obj.userData ?? {};
        obj.userData[VIZON_USER_DATA_KEYS.COMMON.NON_PICKABLE] = true;
        delete obj.userData[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE];
      }
      setVisibilityPickFreeze(readSelectedVisibilityPickFreeze(obj));
      editor.render();
    };
    void editor.executeHistoryOperation({
      name: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.pickableLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.pickableLabel} = ${v.en}`
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
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.freezeLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.freezeLabel} = ${v.en}`
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
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.opacityLabel} = ${displayValue}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.opacityLabel} = ${displayValue}`
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

  const setRenderOrder = (nextRenderOrder: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;

    const next = Math.max(0, Math.min(999, Math.round(nextRenderOrder)));
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'renderOrder', next, {
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.renderOrderLabel} = ${next}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.renderOrderLabel} = ${next}`
      )
    });
    setRenderOrderState({ renderOrder: next, canRenderOrder: true });
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
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.renderOrderLabel} = ${next}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.renderOrderLabel} = ${next}`
      )
    });
    setRenderOrderState({ renderOrder: next, canRenderOrder: true });
  };

  const setCastShadow = (nextCastShadow: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    if (typeof (obj as any).castShadow !== 'boolean') return;
    const v = boolTextI18n(nextCastShadow);
    void editor.setObjectPropertyByUuid(selectedInfo.uuid, 'castShadow', nextCastShadow, {
      operationName: historyName(
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.castShadowLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.castShadowLabel} = ${v.en}`
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
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.receiveShadowLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.receiveShadowLabel} = ${v.en}`
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
        `${historyCategory.zh} - ${selectedInfo.uuid} - ${labelsZh.frustumCulledLabel} = ${v.zh}`,
        `${historyCategory.en} - ${selectedInfo.uuid} - ${labelsEn.frustumCulledLabel} = ${v.en}`
      )
    });
    setShadow((prev) => (prev ? { ...prev, frustumCulled: nextFrustumCulled, canFrustumCulled: true } : prev));
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
              setCastShadow={setCastShadow}
              setReceiveShadow={setReceiveShadow}
              setFrustumCulled={setFrustumCulled}
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

