/**
 * **资源加载器**：负责把外部资产地址解析成 three.js 可挂入场景的对象树。
 *
 * 当前边界：
 * - 封装 GLTF/GLB/FBX/OBJ/STL 的异步加载；
 * - 默认把加载结果加入传入的 `scene`，保持编辑器「导入即出现」体验；
 * - 不负责缓存、材质替换、压缩纹理解码等更重的资源系统能力。
 */
import * as THREE from 'three';
import { GLTFLoader, FBXLoader, OBJLoader, STLLoader } from 'three-stdlib';
import {
  detectModelFormat,
  getModelEntryFileName,
  prepareImportedModelRoot,
  resolveMediaUrl,
} from '../../model3d/modelLoadUtils';

export class AssetLoader {
  constructor(private readonly scene: THREE.Scene) {}

  /**
   * 加载 GLTF/GLB，并默认加入到 `scene`（保持与历史行为一致）。
   * @param url 资源地址（可能是远程 URL 或 blob URL）
   * @param opts.addToScene 是否把根节点加入 scene（默认 true）
   */
  async loadGLTF(url: string, opts?: { addToScene?: boolean }) {
    const loader = new GLTFLoader();
    loader.setCrossOrigin('anonymous');
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene ?? gltf.scenes?.[0];
    if (!root) throw new Error('GLTF 没有 scene');
    if (opts?.addToScene ?? true) this.scene.add(root);
    return root;
  }

  /**
   * 通用模型加载：根据文件名/URL 扩展名自动选择对应 Loader。
   * 支持 GLTF/GLB/FBX/OBJ/STL。
   * @param url 资源地址
   * @param opts.addToScene 是否把根节点加入 scene（默认 true）
   * @param opts.fileName 文件名（用于格式推断，优先于 url 扩展名）
   */
  async loadModel(url: string, opts?: { addToScene?: boolean; fileName?: string }) {
    const resolvedUrl = resolveMediaUrl(url);
    const entryFileName = getModelEntryFileName(resolvedUrl, opts?.fileName);
    const format = detectModelFormat(resolvedUrl, entryFileName);
    let root: THREE.Object3D;

    switch (format) {
      case 'gltf':
      case 'glb': {
        const loader = new GLTFLoader();
        loader.setCrossOrigin('anonymous');
        const gltf = await loader.loadAsync(resolvedUrl);
        root = gltf.scene ?? gltf.scenes?.[0];
        if (!root) throw new Error('GLTF 没有 scene');
        break;
      }
      case 'fbx': {
        root = await new FBXLoader().loadAsync(resolvedUrl);
        break;
      }
      case 'obj': {
        root = await new OBJLoader().loadAsync(resolvedUrl);
        break;
      }
      case 'stl': {
        const geometry = await new STLLoader().loadAsync(resolvedUrl);
        geometry.computeVertexNormals();
        root = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
        root.name = 'STL Model';
        break;
      }
      default:
        throw new Error(`不支持的模型格式: ${url}`);
    }

    await prepareImportedModelRoot(root);

    if (opts?.addToScene ?? true) this.scene.add(root);
    return root;
  }
}
