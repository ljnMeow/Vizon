/**
 * **静态矩阵冻结**：对可选中子树设置 `matrixAutoUpdate=false` 以省矩阵更新；选中时按需解冻子树与祖先链，
 * 避免 Gizmo 与世界矩阵不同步。由 `SelectionOrchestrator` 与场景图添加路径调用。
 */
import * as THREE from 'three';
import { VIZON_USER_DATA_KEYS } from '../../infra/utils';

/**
 * 管理静态对象矩阵冻结策略（matrixAutoUpdate=false）。
 */
export class StaticObjectFreezeController {
  freezeObjectTree(root: THREE.Object3D) {
    root.traverse((obj) => {
      if (!this.canFreezeObject(obj)) return;
      obj.matrixAutoUpdate = false;
      obj.updateMatrix();
      obj.updateMatrixWorld(true);
    });
  }

  unfreezeObjectTree(root: THREE.Object3D) {
    root.traverse((obj) => {
      if (!this.canFreezeObject(obj)) return;
      obj.matrixAutoUpdate = true;
      obj.updateMatrixWorld(true);
    });
  }

  /**
   * 选中子节点时祖先链若仍为 matrixAutoUpdate=false，会阻断世界矩阵传播，导致 gizmo 拖拽后对象消失。
   * 从当前节点的父级解冻直到 stopExclusive（通常为 Scene），不含 stopExclusive 本身。
   */
  unfreezeAncestors(obj: THREE.Object3D, stopExclusive: THREE.Object3D) {
    let cur: THREE.Object3D | null = obj.parent;
    while (cur && cur !== stopExclusive) {
      cur.matrixAutoUpdate = true;
      cur.updateMatrix();
      cur.updateMatrixWorld(true);
      cur = cur.parent;
    }
  }

  private canFreezeObject(obj: THREE.Object3D) {
    if ((obj as any).isCamera) return false;
    if ((obj as any).isLight) return false;
    if ((obj as any).isBone) return false;
    if ((obj as any).isSkinnedMesh) return false;
    if ((obj as any).isTransformControls) return false;
    if (obj.type === 'TransformControlsGizmo' || obj.type === 'TransformControlsPlane') return false;
    if ((obj.userData as any)[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE]) return false;
    if ((obj.userData as any)[VIZON_USER_DATA_KEYS.COMMON.DYNAMIC]) return false;
    return true;
  }
}
