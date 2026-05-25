/**
 * 3D 模型缩略图生成（客户端离屏渲染）。
 *
 * 原理：在离屏 WebGLRenderer 中加载模型文件 → 自动定位相机 → 渲染一帧 → canvas.toBlob()
 * 支持 glTF/GLB、FBX、OBJ、STL 格式。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { FBXLoader } from 'three-stdlib';
import { OBJLoader } from 'three-stdlib';
import { STLLoader } from 'three-stdlib';

const THUMBNAIL_SIZE = 256;
const BG_COLOR = 0x2a2a2e;

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
  const ext = getExt(url);
  const loaderType = EXT_LOADER_MAP[ext];
  if (!loaderType) return null;

  return _renderThumbnail(url, loaderType, size);
}

async function _renderThumbnail(
  url: string,
  loaderType: 'gltf' | 'fbx' | 'obj' | 'stl',
  size: number
): Promise<Blob | null> {
  let renderer: THREE.WebGLRenderer | null = null;

  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const root = await loadModel(url, loaderType);
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

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(size, size);
    renderer.setPixelRatio(1);
    renderer.render(scene, camera);

    const blob = await new Promise<Blob | null>((resolve) =>
      renderer!.domElement.toBlob(resolve, 'image/png')
    );

    return blob;
  } catch {
    return null;
  } finally {
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
      const material = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.2, roughness: 0.6 });
      return new THREE.Mesh(geometry, material);
    }
  }
}
