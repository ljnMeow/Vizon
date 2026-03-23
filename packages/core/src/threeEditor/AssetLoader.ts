import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';

/**
 * 资源加载器（AssetLoader）：
 * - 负责把外部资产地址加载为 three 对象
 * - 当前阶段只提供 GLTF/GLB 直接加载（缓存、材质替换等将在后续 asset 系统扩展）
 */
export class AssetLoader {
  constructor(private readonly scene: THREE.Scene) {}

  /**
   * 加载 GLTF/GLB，并默认加入到 `scene`（保持与历史行为一致）。
   * @param url 资源地址（可能是远程 URL 或 blob URL）
   * @param opts.addToScene 是否把根节点加入 scene（默认 true）
   */
  async loadGLTF(url: string, opts?: { addToScene?: boolean }) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene ?? gltf.scenes?.[0];
    if (!root) throw new Error('GLTF 没有 scene');
    if (opts?.addToScene ?? true) this.scene.add(root);
    return root;
  }
}

