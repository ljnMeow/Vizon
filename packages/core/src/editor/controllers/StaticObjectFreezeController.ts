import * as THREE from 'three';

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

  private canFreezeObject(obj: THREE.Object3D) {
    if ((obj as any).isCamera) return false;
    if ((obj as any).isLight) return false;
    if ((obj as any).isBone) return false;
    if ((obj as any).isSkinnedMesh) return false;
    if ((obj as any).isTransformControls) return false;
    if (obj.type === 'TransformControlsGizmo' || obj.type === 'TransformControlsPlane') return false;
    if ((obj.userData as any).__vizonNonSelectable) return false;
    if ((obj.userData as any).__vizonDynamic) return false;
    return true;
  }
}
