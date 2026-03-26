import { useEffect, useMemo, useState } from 'react';

import { Accordion } from '../../../../components/Accordion';
import { BaseSetting } from './BaseSetting';
import { ObjectAttributes } from './ObjectAttributes';
import { message } from '../../../../components/GlobalMessage';
import { useLocale } from '../../../../hooks/useLocale';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { appMessages } from '../../../../i18n/messages';
import { copyToClipboard } from '../../../../utils/utils';
import { basicModels } from '../../../../utils/models';

const BASIC_MODEL_KEYS = new Set(basicModels.map((m) => m.key));

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

function readSelectedInfo(obj: any): SelectedObjectInfo {
  if (!obj) return null;
  return {
    uuid: obj.uuid,
    type: String(obj.type ?? 'Object'),
    name: String(obj.name ?? '')
  };
}

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

function computeIsNonSelectableInHierarchy(obj: any): boolean {
  let cur: any = obj;
  while (cur) {
    if (Boolean(cur?.userData?.__vizonNonSelectable)) return true;
    cur = cur.parent;
  }
  return false;
}

function computeIsNonPickableInHierarchy(obj: any): boolean {
  let cur: any = obj;
  while (cur) {
    if (Boolean(cur?.userData?.__vizonNonPickable)) return true;
    cur = cur.parent;
  }
  return false;
}

function hasNonSelectableAncestor(obj: any): boolean {
  let cur: any = obj?.parent;
  while (cur) {
    if (Boolean(cur?.userData?.__vizonNonSelectable)) return true;
    cur = cur.parent;
  }
  return false;
}

function computeFreezeCapability(obj: any): boolean {
  if ((obj as any)?.isCamera) return false;
  if ((obj as any)?.isLight) return false;
  if ((obj as any)?.isBone) return false;
  if ((obj as any)?.isSkinnedMesh) return false;
  if ((obj as any)?.isTransformControls) return false;
  if (obj?.type === 'TransformControlsGizmo' || obj?.type === 'TransformControlsPlane') return false;
  if (Boolean(obj?.userData?.__vizonNonSelectable)) return false;
  return true;
}

function readSelectedVisibilityPickFreeze(obj: any): VisibilityPickFreezeState | null {
  if (!obj) return null;

  const visible = Boolean(obj.visible);
  const pickable = !computeIsNonPickableInHierarchy(obj);
  const frozen = !Boolean(obj?.userData?.__vizonDynamic) && obj?.matrixAutoUpdate === false;
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

  const showObjectAttributes = useMemo(() => {
    if (!editor || !selectedInfo?.uuid) return false;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    const key = obj?.userData?.__vizonDefaultModelKey;
    return typeof key === 'string' && BASIC_MODEL_KEYS.has(key);
  }, [editor, selectedInfo?.uuid]);

  const onNameChange = (nextName: string) => {
    if (!editor || !selectedInfo) return;
    // 先直接修改 three 对象 name；sceneTree 的重绘/同步在后续接入。
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    obj.name = nextName;
    setSelectedInfo({ ...selectedInfo, name: nextName });
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

  const updatePositionAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo || !transform) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    obj.position[axis] = next;
    setTransform((prev) => (prev ? { ...prev, position: { ...prev.position, [axis]: next } } : prev));
  };

  const updateRotationAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo || !transform) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    obj.rotation[axis] = next;
    setTransform((prev) => (prev ? { ...prev, rotation: { ...prev.rotation, [axis]: next } } : prev));
  };

  const updateScaleAxis = (axis: AxisKey, next: number) => {
    if (!editor || !selectedInfo || !transform) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    obj.scale[axis] = next;
    setTransform((prev) => (prev ? { ...prev, scale: { ...prev.scale, [axis]: next } } : prev));
  };

  const setVisible = (nextVisible: boolean) => {
    if (!editor || !selectedInfo) return;
    const ok = editor.setObjectVisibleByUuid(selectedInfo.uuid, nextVisible);
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

    if (nextPickable) {
      if (obj.userData) {
        delete obj.userData.__vizonNonPickable;
        // 兼容旧版本：之前错误地用 __vizonNonSelectable 控制 pickable
        delete obj.userData.__vizonNonSelectable;
      }
    } else {
      obj.userData = obj.userData ?? {};
      obj.userData.__vizonNonPickable = true;
      // 兼容旧版本：不要把它标记成 non-selectable（否则会在结构树消失）
      delete obj.userData.__vizonNonSelectable;
    }

    setVisibilityPickFreeze(readSelectedVisibilityPickFreeze(obj));
  };

  const setFrozen = (nextFrozen: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;

    if (!computeFreezeCapability(obj)) return;

    if (nextFrozen) {
      // 让 core 的 freezeObjectTree 可以重新冻结
      if (obj.userData) delete obj.userData.__vizonDynamic;
      obj.traverse((node: any) => {
        if ((node as any)?.isCamera) return;
        if ((node as any)?.isLight) return;
        if ((node as any)?.isBone) return;
        if ((node as any)?.isSkinnedMesh) return;
        if ((node as any)?.isTransformControls) return;
        if (node?.type === 'TransformControlsGizmo' || node?.type === 'TransformControlsPlane') return;
        if (Boolean(node?.userData?.__vizonNonSelectable)) return;
        if (Boolean(node?.userData?.__vizonDynamic)) return;

        node.matrixAutoUpdate = false;
        node.updateMatrix();
        node.updateMatrixWorld(true);
      });
    } else {
      // 让 core 后续拖拽结束不会再把它冻结回来
      obj.userData = obj.userData ?? {};
      obj.userData.__vizonDynamic = true;
      obj.traverse((node: any) => {
        node.matrixAutoUpdate = true;
        node.updateMatrixWorld(true);
      });
    }

    setVisibilityPickFreeze(readSelectedVisibilityPickFreeze(obj));
  };

  const setOpacity = (nextOpacity: number) => {
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
  };

  const setRenderOrder = (nextRenderOrder: number) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;

    const next = Math.max(0, Math.min(999, Math.round(nextRenderOrder)));
    (obj as any).renderOrder = next;
    setRenderOrderState({ renderOrder: next, canRenderOrder: true });
  };

  const setCastShadow = (nextCastShadow: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    if (typeof (obj as any).castShadow !== 'boolean') return;
    (obj as any).castShadow = nextCastShadow;
    setShadow((prev) => (prev ? { ...prev, castShadow: nextCastShadow, canCastShadow: true } : prev));
  };

  const setReceiveShadow = (nextReceiveShadow: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    if (typeof (obj as any).receiveShadow !== 'boolean') return;
    (obj as any).receiveShadow = nextReceiveShadow;
    setShadow((prev) => (prev ? { ...prev, receiveShadow: nextReceiveShadow, canReceiveShadow: true } : prev));
  };

  const setFrustumCulled = (nextFrustumCulled: boolean) => {
    if (!editor || !selectedInfo) return;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid);
    if (!obj) return;
    if (typeof (obj as any).frustumCulled !== 'boolean') return;
    (obj as any).frustumCulled = nextFrustumCulled;
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
              onNameChange={onNameChange}
              copyUuid={copyUuid}
              updatePositionAxis={updatePositionAxis}
              updateRotationAxis={updateRotationAxis}
              updateScaleAxis={updateScaleAxis}
              setVisible={setVisible}
              setPickable={setPickable}
              setFrozen={setFrozen}
              setOpacity={setOpacity}
              setRenderOrder={setRenderOrder}
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

