/**
 * 默认相机工厂：创建可拖入场景的透视/正交相机，并可选手绑 `CameraHelper`。
 *
 * Helper 必须作为 scene 独立子节点（不能挂为 camera 子对象），否则会与 `matrixWorld` 双变换；
 * `ThreeEditor.add` 会读取 `userData.__vizonCameraHelper` 并维护更新。
 */
import * as THREE from 'three';

export type DefaultCameraKey = 'orthographic' | 'perspective';

export type Vec3Like = { x: number; y: number; z: number };

export type CreateDefaultCameraOptions = {
  position?: Vec3Like;
  lookAt?: Vec3Like;
  name?: string;
  /**
   * 是否为该相机创建并挂载 CameraHelper。
   * @default true
   */
  helperEnabled?: boolean;
};

export type DefaultCameraMeta = {
  key: DefaultCameraKey;
  label: string;
};

export const defaultCameras: DefaultCameraMeta[] = [
  { key: 'orthographic', label: 'orthographic' },
  { key: 'perspective', label: 'perspective' }
];

function applyCommon(camera: THREE.Camera, key: DefaultCameraKey, opts?: CreateDefaultCameraOptions) {
  const name = opts?.name ?? (key === 'perspective' ? 'PerspectiveCamera' : 'OrthographicCamera');
  camera.name = name;
  (camera.userData as any).__vizonDefaultCamera = true;
  (camera.userData as any).__vizonDefaultCameraKey = key;

  if (opts?.position) {
    camera.position.set(opts.position.x, opts.position.y, opts.position.z);
  }
  if (opts?.lookAt) {
    camera.lookAt(opts.lookAt.x, opts.lookAt.y, opts.lookAt.z);
  }
}

function configureCameraHelper(helper: THREE.CameraHelper) {
  helper.userData.__vizonNonSelectable = true;
  helper.userData.hideInEditor = true;

  const material = (helper as any).material as THREE.Material | THREE.Material[] | undefined;
  const materials = material ? (Array.isArray(material) ? material : [material]) : [];
  for (const m of materials) {
    m.depthTest = false;
    m.depthWrite = false;
    (m as any).toneMapped = false;
    m.transparent = true;
    m.opacity = 0.9;
    m.needsUpdate = true;
  }
  helper.renderOrder = 9_000;
}

export function createDefaultCamera(key: DefaultCameraKey, opts?: CreateDefaultCameraOptions) {
  const helperEnabled = opts?.helperEnabled ?? true;

  if (key === 'perspective') {
    // 默认相机用于编辑器内放置与预览：far 太大时 CameraHelper 会显得“巨大”且干扰编辑。
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    // 默认略微抬高，避免创建后“看地面穿模”。
    camera.position.set(2.5, 2.0, 2.5);
    // 默认保持视线与地面平行（不下俯），便于拖拽创建后的初始编辑体验。
    camera.lookAt(0, 2.0, 0);
    applyCommon(camera, key, opts);
    if (helperEnabled) {
      const helper = new THREE.CameraHelper(camera);
      configureCameraHelper(helper);
      // 注意：CameraHelper.update() 内部会使用 camera.matrixWorld 变换顶点；
      // 若把 helper 作为 camera 子节点挂载会导致“二次变换”产生偏移。
      // 因此 helper 由 ThreeEditor 以独立对象加入 scene，并在渲染时更新。
      helper.userData.__vizonPickTarget = camera;
      (camera.userData as any).__vizonCameraHelper = helper;
    }
    camera.updateProjectionMatrix();
    return camera;
  }

  // OrthographicCamera 需要 left/right/top/bottom；这里用一个可用的默认视锥，
  // 具体显示效果由上层在切换到该相机时按 viewport aspect 再适配。
  const size = 1.5;
  const camera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 200);
  camera.position.set(2.5, 2.0, 2.5);
  // 默认保持视线与地面平行（不下俯），便于拖拽创建后的初始编辑体验。
  camera.lookAt(0, 2.0, 0);
  applyCommon(camera, key, opts);
  if (helperEnabled) {
    const helper = new THREE.CameraHelper(camera);
    configureCameraHelper(helper);
    helper.userData.__vizonPickTarget = camera;
    (camera.userData as any).__vizonCameraHelper = helper;
  }
  camera.updateProjectionMatrix();
  return camera;
}

