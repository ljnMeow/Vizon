import * as THREE from 'three';

/**
 * three.js `Raycaster` 与 `Object3D.layers` 配合：通过层掩码在相交测试时快速「剪掉」整棵子树，
 * 避免对 TransformControls / GridHelper 等大子树做无谓三角形测试。
 */

/** Layer 0：用户导入模型、默认可见的可拾取物体（与 three 新建 Object3D 的默认层一致） */
export const VIZON_SCENE_CONTENT_LAYER = 0;

/**
 * Layer 1：编辑器专用叠加物（gizmo、网格、坐标轴、选中盒等）。
 * 仅当渲染相机的 layer mask 包含本层时才会被画出；拾取用射线应只开 layer 0，从而跳过本层几何。
 */
export const VIZON_EDITOR_OVERLAY_LAYER = 1;

/**
 * 将 `root` 及其所有后代统一设到 `VIZON_EDITOR_OVERLAY_LAYER`（替换 mask，不再属于 layer 0）。
 * @param root 通常是 TransformControls、GridHelper、BoxHelper 根节点
 */
export function applyEditorOverlayLayer(root: THREE.Object3D) {
  root.traverse((obj) => {
    obj.layers.set(VIZON_EDITOR_OVERLAY_LAYER); // 每个 Object3D 独立 layers，需遍历
  });
}

/**
 * 主编辑透视相机默认只渲染 layer 0；调用后额外启用 layer 1，才能看到叠加辅助对象。
 * @param camera 实际执行 `renderer.render(scene, camera)` 的那台相机
 */
export function enableEditorViewLayers(camera: THREE.Camera) {
  camera.layers.enable(VIZON_EDITOR_OVERLAY_LAYER); // 位或进 mask，保留原有 layer 0
}

/**
 * 约束射线只与「场景内容层」相交；必须与 `applyEditorOverlayLayer` 策略成对使用。
 * @param raycaster 每帧或每次点击复用的 Raycaster 实例
 */
export function configureRaycasterForScenePicking(raycaster: THREE.Raycaster) {
  raycaster.layers.set(VIZON_SCENE_CONTENT_LAYER); // mask 仅 layer 0
}
