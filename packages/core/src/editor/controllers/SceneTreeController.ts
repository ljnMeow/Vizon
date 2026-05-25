/**
 * **场景树 JSON 构建**：从 `THREE.Scene` 与「相机根」walk 出生成的 `SceneTreeNode[]`，过滤 helper/gizmo 等类型；
 * 供 UI 结构面板与持久化 `sceneTree` 字段使用。
 */
import * as THREE from 'three';
import { VIZON_USER_DATA_KEYS } from '../../infra/utils';
import type { SceneTreeNode, SceneTreeNodeKind } from '../../settings/sceneTree';
import { isNonSelectableInHierarchy } from '../picking/objectGuards';

/**
 * SceneTreeController：
 * 聚合“场景树构建 + 节点过滤规则”，让 ThreeEditor 仅保留编排职责。
 */
export class SceneTreeController {
  private static readonly IGNORED_TYPES = new Set([
    'GridHelper',
    'AxesHelper',
    'TransformControls',
    'TransformControlsGizmo',
    'TransformControlsPlane',
    'CameraHelper',
    'BoxHelper',
    'PointLightHelper',
    'DirectionalLightHelper',
    'HemisphereLightHelper',
    'SpotLightHelper'
  ]);

  getSceneTree(scene: THREE.Scene, camera: THREE.PerspectiveCamera): SceneTreeNode[] {
    const cameraNode: SceneTreeNode = {
      uuid: camera.uuid,
      name: camera.name || 'Camera',
      type: camera.type,
      visible: camera.visible,
      kind: 'camera',
      children: []
    };

    const sceneNode: SceneTreeNode = {
      uuid: scene.uuid,
      name: scene.name || 'Scene',
      type: scene.type,
      visible: scene.visible,
      kind: 'scene',
      children: scene.children
        .map((child) => this.toSceneTreeNode(child))
        .filter((node): node is SceneTreeNode => node != null)
    };

    return [cameraNode, sceneNode];
  }

  isIgnoredInSceneTree(obj: THREE.Object3D) {
    if (isNonSelectableInHierarchy(obj)) return true;
    if ((obj as any).isTransformControls) return true;
    if (SceneTreeController.IGNORED_TYPES.has(obj.type)) return true;
    if (obj.name === 'TransformControlsEditor') return true;
    if (obj.parent?.type === 'TransformControlsGizmo') return true;
    if ((obj.userData as any)?.[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR]) return true;
    return false;
  }

  private toSceneTreeNode(obj: THREE.Object3D): SceneTreeNode | null {
    if (this.isIgnoredInSceneTree(obj)) return null;
    const children = obj.children.map((child) => this.toSceneTreeNode(child)).filter((node): node is SceneTreeNode => node != null);
    if (obj.type === 'Object3D' && !obj.name && children.length === 0) return null;
    return {
      uuid: obj.uuid,
      name: obj.name || obj.type,
      type: obj.type,
      visible: obj.visible,
      kind: this.getSceneNodeKind(obj),
      nonDeletable: !!(obj.userData as Record<string, unknown>)[VIZON_USER_DATA_KEYS.COMMON.NON_DELETABLE],
      children
    };
  }

  private getSceneNodeKind(obj: THREE.Object3D): SceneTreeNodeKind {
    if (obj.type === 'Scene') return 'scene';
    if ((obj as any).isCamera) return 'camera';
    if ((obj as any).isLight) return 'light';
    if (obj.type === 'Group') return 'group';
    return 'object';
  }
}
