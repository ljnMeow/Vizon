/**
 * 3D 模型缩略图生成（客户端离屏渲染）。
 *
 * 原理：在离屏 WebGLRenderer 中加载模型文件 → 自动定位相机 → 渲染一帧 → canvas.toBlob()
 * 支持 glTF/GLB、FBX、OBJ、STL 格式。
 *
 * 光照与主编辑器视口对齐：RoomEnvironment IBL + 浅色背景，确保 PBR 材质有足够对比度。
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three-stdlib';
import { FBXLoader } from 'three-stdlib';
import { OBJLoader } from 'three-stdlib';
import { STLLoader } from 'three-stdlib';
import { DEFAULT_MESH_COLOR } from '../defaults/registry';
import { prepareImportedModelRoot, resolveMediaUrl } from './modelLoadUtils';

const THUMBNAIL_SIZE = 256;
/** 与 DEFAULT_SCENE_SETTINGS.environment.backgroundColor 一致 */
const BG_COLOR = 0xf3f4f6;

const EXT_LOADER_MAP: Record<string, 'gltf' | 'fbx' | 'obj' | 'stl'> = {
  '.gltf': 'gltf',
  '.glb': 'gltf',
  '.fbx': 'fbx',
  '.obj': 'obj',
  '.stl': 'stl',
};

function getExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

/** 是否支持生成缩略图的模型格式。 */
export function isModel3dThumbnailSupported(filename: string): boolean {
  return getExt(filename) in EXT_LOADER_MAP;
}

/** 为 3D 模型文件生成缩略图 PNG。不支持的格式返回 null。 */
export async function generateModel3dThumbnail(
  file: File,
  size = THUMBNAIL_SIZE
): Promise<Blob | null> {
  const ext = getExt(file.name);
  const loaderType = EXT_LOADER_MAP[ext];
  if (!loaderType) return null;

  const objectUrl = URL.createObjectURL(file);
  try {
    return await _renderThumbnail(objectUrl, loaderType, size);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** 从 URL 加载模型并生成缩略图 PNG（用于 ZIP 解压后的多文件 GLTF）。 */
export async function generateModel3dThumbnailFromUrl(
  url: string,
  size = THUMBNAIL_SIZE
): Promise<Blob | null> {
  const resolvedUrl = resolveMediaUrl(url);
  const ext = getExt(resolvedUrl);
  const loaderType = EXT_LOADER_MAP[ext];
  if (!loaderType) return null;

  return _renderThumbnail(resolvedUrl, loaderType, size);
}

/** 与 ThreeEditor 一致的默认 IBL 环境贴图（摄影棚级 PBR 光照）。 */
function createDefaultEnvironmentTexture(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const texture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();
  return texture;
}

async function _renderThumbnail(
  url: string,
  loaderType: 'gltf' | 'fbx' | 'obj' | 'stl',
  size: number
): Promise<Blob | null> {
  let renderer: THREE.WebGLRenderer | null = null;
  let environmentTexture: THREE.Texture | null = null;

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(size, size);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);
    environmentTexture = createDefaultEnvironmentTexture(renderer);
    scene.environment = environmentTexture;
    scene.environmentIntensity = 1;

    // 主光勾勒形体；IBL 负责 PBR 漫反射与镜面反射
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.45);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
    fillLight.position.set(-4, 2, -6);
    scene.add(fillLight);

    const root = await loadModel(url, loaderType);
    await prepareImportedModelRoot(root);
    scene.add(root);

    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const sizeVec = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
    const safeDim = maxDim > 0 ? maxDim : 1;

    root.position.sub(center);

    const camera = new THREE.PerspectiveCamera(45, 1, safeDim * 0.01, safeDim * 100);
    const dist = safeDim * 2.0;
    camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);

    const blob = await new Promise<Blob | null>((resolve) =>
      renderer!.domElement.toBlob(resolve, 'image/png')
    );

    return blob;
  } catch {
    return null;
  } finally {
    environmentTexture?.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }
}

async function loadModel(url: string, type: 'gltf' | 'fbx' | 'obj' | 'stl'): Promise<THREE.Object3D> {
  switch (type) {
    case 'gltf': {
      const loader = new GLTFLoader();
      loader.setCrossOrigin('anonymous');
      const gltf = await loader.loadAsync(url);
      return gltf.scene;
    }
    case 'fbx': {
      const loader = new FBXLoader();
      return await loader.loadAsync(url);
    }
    case 'obj': {
      const loader = new OBJLoader();
      return await loader.loadAsync(url);
    }
    case 'stl': {
      const loader = new STLLoader();
      const geometry = await loader.loadAsync(url);
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: DEFAULT_MESH_COLOR,
        metalness: 0.15,
        roughness: 0.55,
      });
      return new THREE.Mesh(geometry, material);
    }
  }
}
