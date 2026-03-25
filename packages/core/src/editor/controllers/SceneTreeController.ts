import * as THREE from 'three';
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
    if ((obj.userData as any)?.hideInEditor) return true;
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
