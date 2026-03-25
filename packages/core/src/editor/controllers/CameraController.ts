import * as THREE from 'three';
import type { SceneSettings } from '../../settings/sceneSettings';
import type { OrbitControls } from 'three-stdlib';

/**
 * 相机控制器：把 core 的 `SceneSettings.camera` 同步到 three 的
 * `Camera` 与 `OrbitControls.target`。
 */
export class CameraController {
  /**
   * 应用相机参数，并确保 OrbitControls 的观察点与相机 lookAt 同步。
   */
  applyCameraSettings(
    camera: THREE.PerspectiveCamera,
    orbit: OrbitControls,
    nextCamera: SceneSettings['camera'],
    aspect: number
  ) {
    camera.fov = nextCamera.fov;
    camera.aspect = aspect;

    camera.near = nextCamera.near;
    camera.far = nextCamera.far;
    camera.position.set(nextCamera.position.x, nextCamera.position.y, nextCamera.position.z);

    // OrbitControls 的 target 作为相机“观察点”
    orbit.target.set(nextCamera.target.x, nextCamera.target.y, nextCamera.target.z);
    camera.lookAt(orbit.target);

    camera.updateProjectionMatrix();
    orbit.update();
  }
}

