import * as THREE from 'three';
import type { SceneSettingsGrid, SceneSettingsHelpers } from '../sceneSettings';

/**
 * 辅助器控制器：统一管理网格与坐标轴。
 */
export class HelperController {
  private scene: THREE.Scene | null = null;

  // GridHelper
  private grid: THREE.GridHelper;
  private lastGridColor = '#334155';

  private axes = new THREE.AxesHelper(1.5);
  // 当前仅保留网格/坐标轴辅助。

  constructor() {
    this.grid = new THREE.GridHelper(
      50,
      50,
      new THREE.Color(this.lastGridColor),
      new THREE.Color(this.lastGridColor)
    );
    this.grid.userData.__vizonNonSelectable = true;

    this.axes.userData.__vizonNonSelectable = true;
    // 默认先不显示，避免 mount 后到首次 applySceneSettings 之间出现闪烁。
    this.axes.visible = false;
    this.axes.position.set(0, 0.001, 0);
    this.configureAxesMaterial();
  }

  mount(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.grid);
    scene.add(this.axes);
  }

  applyGrid(settings: SceneSettingsGrid) {
    const gridColorHex = settings.color;

    if (gridColorHex !== this.lastGridColor) {
      this.recreateGrid(gridColorHex);
    }

    this.grid.visible = settings.enabled;
    const material = this.grid.material as THREE.Material;
    material.transparent = settings.opacity < 1;
    material.opacity = settings.opacity;
    material.needsUpdate = true;
  }

  applyHelpers(settings: SceneSettingsHelpers) {
    this.axes.visible = settings.axes.enabled;
    this.axes.scale.setScalar(settings.axes.size / 1.5);
  }

  syncHelpers(_opts?: unknown) {}

  dispose() {
    if (!this.scene) return;
    this.scene.remove(this.grid);
    this.scene.remove(this.axes);
    this.grid.geometry.dispose();
    this.disposeMaterial(this.grid.material);
    this.scene = null;
  }

  private recreateGrid(gridColorHex: string) {
    // GridHelper(size, divisions, centerLineColor, gridColor)
    const next = new THREE.GridHelper(
      50,
      50,
      new THREE.Color(gridColorHex),
      new THREE.Color(gridColorHex)
    );
    next.userData.__vizonNonSelectable = true;
    next.visible = this.grid.visible;

    // 尽量复用当前透明度配置（applyGrid 会紧接着再设置一次 opacity）
    const oldMaterial = this.grid.material;
    const nextMaterial = next.material;
    this.forEachMaterial(nextMaterial, (material) => {
      const old = Array.isArray(oldMaterial) ? oldMaterial[0] : oldMaterial;
      material.transparent = old.transparent;
      material.opacity = old.opacity;
    });

    if (this.scene) {
      this.scene.remove(this.grid);
      this.scene.add(next);
    }

    this.grid.geometry.dispose();
    this.disposeMaterial(oldMaterial);

    this.grid = next;
    this.lastGridColor = gridColorHex;
  }

  private configureAxesMaterial() {
    this.forEachMaterial(this.axes.material, (material) => {
      // 辅助线应尽量不被模型遮挡，保证编辑态可见性。
      material.depthTest = false;
      material.depthWrite = false;
      material.toneMapped = false;
      material.transparent = true;
      material.opacity = 0.9;
      material.needsUpdate = true;
    });
    this.axes.renderOrder = 10_000;
  }

  private forEachMaterial(material: THREE.Material | THREE.Material[], cb: (m: THREE.Material) => void) {
    if (Array.isArray(material)) {
      material.forEach((m) => cb(m));
      return;
    }
    cb(material);
  }

  private disposeMaterial(material: THREE.Material | THREE.Material[]) {
    this.forEachMaterial(material, (m) => m.dispose());
  }
}

