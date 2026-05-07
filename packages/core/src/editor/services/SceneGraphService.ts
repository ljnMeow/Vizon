import * as THREE from 'three';
import type { SceneTreeNode } from '../../settings/sceneTree';

export type SceneGraphHost = {
  getScene(): THREE.Scene;
  getCameraRoot(): THREE.Camera;
  getSceneTree(): SceneTreeNode[];
  updateSceneSettingsSceneTree(tree: SceneTreeNode[]): void;
  emitSceneTreeChange(tree: SceneTreeNode[]): void;

  // helpers / side effects hooks
  bindHelpersForSubtree(root: THREE.Object3D): void;
  unbindHelpersForSubtree(root: THREE.Object3D): void;
  freezeObjectTreeIfEnabled(root: THREE.Object3D): void;
  shouldFreezeStaticObjects(): boolean;

  // editor side effects
  requestShadowMapUpdate(): void;
  renderOnce(): void;
  clearSelectionIfContains(obj: THREE.Object3D): void;

  // misc
  isNonSelectableInHierarchy(obj: THREE.Object3D): boolean;
  isVisibleInHierarchy(obj: THREE.Object3D): boolean;
  syncHelperVisibilityForSubtree(root: THREE.Object3D): void;
};

/**
 * 场景图服务：承载节点增删改/排序，以及场景树同步。
 *
 * 设计约束（T007 阶段）：
 * - 仅搬运 + 委托，不改变对外行为；
 * - 复杂副作用（helper 绑定、冻结、选择联动）仍由 host 负责实现。
 */
export class SceneGraphService {
  private host: SceneGraphHost;

  constructor(host: SceneGraphHost) {
    this.host = host;
  }

  getSceneTree(): SceneTreeNode[] {
    return this.host.getSceneTree();
  }

  syncSceneTreeState() {
    const tree = this.host.getSceneTree();
    this.host.updateSceneSettingsSceneTree(tree);
    this.host.emitSceneTreeChange(tree);
  }

  insertChildAt(parent: THREE.Object3D, child: THREE.Object3D, index: number): void {
    if (child.parent) child.parent.remove(child);
    const n = Math.max(0, Math.min(index, parent.children.length));
    parent.children.splice(n, 0, child);
    child.parent = parent;
    this.host.bindHelpersForSubtree(child);
  }

  detachObjectFromParent(child: THREE.Object3D) {
    this.host.unbindHelpersForSubtree(child);
    child.parent?.remove(child);
  }

  add(object: THREE.Object3D) {
    const scene = this.host.getScene();
    scene.add(object);
    this.host.freezeObjectTreeIfEnabled(object);
    this.host.requestShadowMapUpdate();
    this.syncSceneTreeState();
  }

  setObjectVisibleByUuid(uuid: string, visible: boolean) {
    const scene = this.host.getScene();
    const obj = scene.getObjectByProperty('uuid', uuid);
    if (!obj || this.host.isNonSelectableInHierarchy(obj)) return false;
    obj.visible = visible;
    this.host.syncHelperVisibilityForSubtree(obj);
    if (!visible) {
      // 若隐藏导致当前选中链不可见则清空选择（行为由 host 实现）。
      // 这里不遍历 selectedObjects，交给 host 做更精确判断。
    }
    this.host.requestShadowMapUpdate();
    this.syncSceneTreeState();
    return true;
  }

  removeObjectByUuid(uuid: string): boolean {
    const scene = this.host.getScene();
    const obj = scene.getObjectByProperty('uuid', uuid);
    if (!obj || !obj.parent || this.host.isNonSelectableInHierarchy(obj)) return false;
    this.host.clearSelectionIfContains(obj);
    obj.parent.remove(obj);
    this.host.requestShadowMapUpdate();
    this.syncSceneTreeState();
    return true;
  }

  canMoveObjectByUuid(sourceUuid: string, targetUuid: string, placement: 'before' | 'after' | 'inside'): boolean {
    const resolved = this.resolveMoveObjects(sourceUuid, targetUuid);
    if (!resolved) return false;
    return this.isMovePlacementValid(resolved.source, resolved.target, placement);
  }

  moveObjectByUuid(sourceUuid: string, targetUuid: string, placement: 'before' | 'after' | 'inside'): boolean {
    const resolved = this.resolveMoveObjects(sourceUuid, targetUuid);
    if (!resolved) return false;
    const { source, target } = resolved;
    if (!this.isMovePlacementValid(source, target, placement)) return false;

    const scene = this.host.getScene();

    if (placement === 'inside') {
      scene.updateMatrixWorld(true);
      target.updateMatrixWorld(true);
      target.attach(source);
      this.host.requestShadowMapUpdate();
      this.syncSceneTreeState();
      return true;
    }

    const parent = target.parent;
    if (!parent) return false;
    scene.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    parent.attach(source);

    const targetIndex = parent.children.indexOf(target);
    if (targetIndex < 0) return false;
    parent.remove(source);
    const refreshedTargetIndex = parent.children.indexOf(target);
    if (refreshedTargetIndex < 0) return false;
    const insertIndex = placement === 'before' ? refreshedTargetIndex : refreshedTargetIndex + 1;
    this.insertChildAt(parent, source, insertIndex);

    this.host.requestShadowMapUpdate();
    this.syncSceneTreeState();
    return true;
  }

  private resolveMoveObjects(
    sourceUuid: string,
    targetUuid: string
  ): { source: THREE.Object3D; target: THREE.Object3D } | null {
    const scene = this.host.getScene();
    const source = scene.getObjectByProperty('uuid', sourceUuid);
    if (!source || !source.parent) return null;
    if (this.host.isNonSelectableInHierarchy(source)) return null;
    if (source.type === 'Scene') return null;
    if ((source as any).isTransformControls) return null;

    const cameraRoot = this.host.getCameraRoot();
    const target = targetUuid === cameraRoot.uuid ? cameraRoot : scene.getObjectByProperty('uuid', targetUuid);
    if (!target) return null;
    if (this.host.isNonSelectableInHierarchy(target)) return null;

    return { source, target };
  }

  private isUnderSourceSubtree(source: THREE.Object3D, target: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = target;
    while (cur) {
      if (cur === source) return true;
      cur = cur.parent;
    }
    return false;
  }

  private isMovePlacementValid(
    source: THREE.Object3D,
    target: THREE.Object3D,
    placement: 'before' | 'after' | 'inside'
  ): boolean {
    if (source === target) return false;
    if (this.isUnderSourceSubtree(source, target)) return false;

    if (placement === 'inside') {
      if (target === this.host.getCameraRoot()) return false;
      return !this.host.isNonSelectableInHierarchy(target);
    }

    const parent = target.parent;
    if (!parent) return false;
    if (this.host.isNonSelectableInHierarchy(parent)) return false;
    return true;
  }
}

