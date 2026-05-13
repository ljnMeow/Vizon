/**
 * **资源加载器**：负责把外部资产地址解析成 three.js 可挂入场景的对象树。
 *
 * 当前边界：
 * - 仅封装 GLTF/GLB 的异步加载；
 * - 默认把加载结果加入传入的 `scene`，保持编辑器「导入即出现」体验；
 * - 不负责缓存、材质替换、压缩纹理解码等更重的资源系统能力。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
export class AssetLoader {
  constructor(private readonly scene: THREE.Scene) {}

  /**
   * 加载 GLTF/GLB，并默认加入到 `scene`（保持与历史行为一致）。
   * @param url 资源地址（可能是远程 URL 或 blob URL）
   * @param opts.addToScene 是否把根节点加入 scene（默认 true）
   */
  async loadGLTF(url: string, opts?: { addToScene?: boolean }) {
    // loader 局部创建即可；当前没有跨请求缓存状态，避免控制器持有更多生命周期责任。
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    // three 约定 gltf.scene 为主入口；极端情况下退回 scenes[0] 兼容导出差异。
    const root = gltf.scene ?? gltf.scenes?.[0];
    if (!root) throw new Error('GLTF 没有 scene');
    // 默认直接挂入当前编辑场景，减少调用端模板代码。
    if (opts?.addToScene ?? true) this.scene.add(root);
    return root;
  }
}
