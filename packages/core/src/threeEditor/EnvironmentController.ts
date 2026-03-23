import * as THREE from 'three';
import { EXRLoader, RGBELoader } from 'three-stdlib';
import type { SceneSettings } from '../sceneSettings';

/**
 * 环境/背景控制器的参数：
 * - next/prev：用于判断 HDRI 是否需要重载
 * - seq + getLatestSeq：用于异步 HDRI 加载的竞态保护
 */
export type EnvironmentApplyParams = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  next: SceneSettings['environment'];
  prev: SceneSettings['environment'];
  seq: number;
  getLatestSeq: () => number;
};

/**
 * EnvironmentController：
 * 负责把 `SceneSettings.environment` 同步到 three 的：
 * - `scene.background`
 * - `scene.environment`
 * - `scene.environmentIntensity`
 *
 * HDRI 加载是异步的，因此通过 seq 校验保证“最后一次设置”生效。
 */
export class EnvironmentController {
  private activeHdriTexture: THREE.Texture | null = null;

  /**
   * 应用环境设置。
   * @returns 当 seq 校验失败时返回 false（表示本次异步结果不要继续应用后续步骤）。
   */
  async applyEnvironment(params: EnvironmentApplyParams): Promise<boolean> {
    const { scene, renderer, next, prev, seq, getLatestSeq } = params;

    const bgColor = new THREE.Color(next.backgroundColor);
    // Ensure canvas shows deterministic background even when renderer is created with `alpha: true`.
    renderer.setClearColor(bgColor, 1);

    if (next.backgroundMode === 'solid') {
      // 清空纹理环境，转为纯色背景
      scene.background = bgColor;
      scene.environment = null;
      scene.environmentIntensity = 1;
      if (this.activeHdriTexture) {
        this.activeHdriTexture.dispose();
        this.activeHdriTexture = null;
      }
      return true;
    }

    // skybox mode: if hdri is none => fallback to solid background
    if (next.hdri.type === 'none') {
      scene.background = bgColor;
      scene.environment = null;
      scene.environmentIntensity = 1;
      if (this.activeHdriTexture) {
        this.activeHdriTexture.dispose();
        this.activeHdriTexture = null;
      }
      return true;
    }

    const url = next.hdri.url;
    if (prev.hdri.type !== 'uploaded' || prev.hdri.url !== url || !this.activeHdriTexture) {
      if (this.activeHdriTexture) {
        this.activeHdriTexture.dispose();
        this.activeHdriTexture = null;
      }

      const texture = await this.loadHdriTexture(next.hdri);
      // 保证“最后一次变更”生效，避免异步加载竞态覆盖新状态
      if (seq !== getLatestSeq()) {
        texture.dispose();
        return false;
      }

      this.activeHdriTexture = texture;
      scene.background = texture;
      scene.environment = texture;
    }

    // 贴图未变但 strength/fog 可能变了：确保强度同步
    scene.environmentIntensity = next.environmentStrength;
    return true;
  }

  /**
   * 同步雾状态。雾配置属于 environment 的一部分，因此收敛到该控制器统一管理。
   */
  applyFog(params: {
    scene: THREE.Scene;
    fog: SceneSettings['environment']['fog'];
    seq: number;
    getLatestSeq: () => number;
  }) {
    const { scene, fog, seq, getLatestSeq } = params;
    if (seq !== getLatestSeq()) return;

    if (fog.enabled) {
      const fogColor = new THREE.Color(fog.color);
      scene.fog = new THREE.Fog(fogColor, fog.near, fog.far);
    } else {
      scene.fog = null;
    }
  }

  dispose() {
    // 释放当前 HDRI 纹理资源，避免内存泄漏。
    if (this.activeHdriTexture) {
      this.activeHdriTexture.dispose();
      this.activeHdriTexture = null;
    }
  }

  private async loadHdriTexture(hdri: SceneSettings['environment']['hdri']) {
    if (hdri.type !== 'uploaded') {
      throw new Error('loadHdriTexture called with non-uploaded hdri');
    }

    const url = hdri.url;
    const fileName = hdri.fileName ?? '';
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

    // 1) HDR/EXR：用三方加载器
    if (ext === 'hdr') {
      const loader = new RGBELoader();
      const texture = await loader.loadAsync(url);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.LinearSRGBColorSpace;
      return texture;
    }

    if (ext === 'exr') {
      const loader = new EXRLoader();
      const texture = await loader.loadAsync(url);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.LinearSRGBColorSpace;
      return texture;
    }

    // 2) 普通图片：让 three 自己按 sRGB 处理
    const loader = new THREE.TextureLoader();
    const texture = await loader.loadAsync(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    // 常见 LDR equirectangular 图默认是 sRGB
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}

