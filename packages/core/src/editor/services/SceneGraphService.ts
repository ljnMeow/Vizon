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
 * 设计约束：
 * - 该 service 聚焦“结构变更 + 触发同步”，不直接承担编辑器的具体副作用。
 * - 与 editor 强耦合的复杂副作用（例如 helper 绑定/解绑、静态冻结、选择联动、阴影重建时机）均由 `host` 注入实现。
 * - 这样做的目标是：减少重复代码、保证行为一致（服务只做搬运与委托），同时让 `ThreeEditor` 负责“端到端交互链路”的完整闭环。
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

  /**
   * 将 `child` 插入到 `parent.children` 的指定位置。
   *
   * 说明：
   * - 通过显式 remove 断开旧父节点，避免 Three.js/编辑器内部出现“一物多父”的隐患。
   * - helper/辅助器的创建与挂接交给 host（因为 host 维护着 camera/light helper 的映射与 dirty 标记）。
   */
  insertChildAt(parent: THREE.Object3D, child: THREE.Object3D, index: number): void {
    if (child.parent) child.parent.remove(child);
    const n = Math.max(0, Math.min(index, parent.children.length));
    parent.children.splice(n, 0, child);
    child.parent = parent;
    this.host.bindHelpersForSubtree(child);
  }

  /**
   * 从父节点上“脱挂”一个节点，并同步解绑其 subtree helper。
   * 注意：这里不会触发 sceneTree 同步，由调用方/上层链路决定同步时机。
   */
  detachObjectFromParent(child: THREE.Object3D) {
    this.host.unbindHelpersForSubtree(child);
    child.parent?.remove(child);
  }

  /**
   * 把节点挂载到 scene，并在可选开关开启时执行静态矩阵冻结。
   * 之后统一触发阴影刷新与 sceneTree 同步，让“结构变化→UI可见→视觉正确”闭环。
   */
  add(object: THREE.Object3D) {
    const scene = this.host.getScene();
    scene.add(object);
    this.host.freezeObjectTreeIfEnabled(object);
    this.host.requestShadowMapUpdate();
    this.syncSceneTreeState();
  }

  /**
   * 根据 uuid 切换可见性（visible）。
   * - 仅处理结构层可见性：对 helper 的可见性由 `host.syncHelperVisibilityForSubtree` 实现。
   * - 当前实现不直接遍历 selection，是因为“隐藏后是否清空选中”属于 host 的领域知识（编辑器的 selection guard 可能更复杂）。
   */
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

  /**
   * 移除场景中一个对象（按 uuid 定位）。
   * - 会先处理选择清理（如果 selection 包含该对象）。
   * - 再移除父节点中的对象，并触发阴影刷新与 sceneTree 同步。
   */
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

  /**
   * 执行“拖拽排序/改父级”移动：
   * - `inside`：使用 `attach` 保留世界变换，再挂到 target 下。
   * - `before/after`：把 source 重新插入到 target 父节点的 children 列表中指定位置。
   *
   * 返回值表示是否真的完成移动（同时保证不产生非法循环引用）。
   */
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

