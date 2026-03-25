/**
 * 默认几何体工厂：`Mesh` + `MeshStandardMaterial`，用于资产面板快速占位。
 *
 * 使用 emissive 略提亮，在场景尚未布置灯光时仍可辨认形状；非 PBR 工作流最终应由用户替换材质。
 */
import * as THREE from 'three';

export type DefaultModelKey =
  | 'cube'
  | 'sphere'
  | 'plane'
  | 'circular'
  | 'cone'
  | 'cylinder'
  | 'torus'
  | 'theConduit';

export type Vec3Like = { x: number; y: number; z: number };

export type CreateDefaultModelOptions = {
  position?: Vec3Like;
  rotation?: { x: number; y: number; z: number };
  scale?: number;
};

export type DefaultModelMeta = {
  key: DefaultModelKey;
  label: string;
};

export const defaultModels: DefaultModelMeta[] = [
  { key: 'cube', label: 'cube' },
  { key: 'sphere', label: 'sphere' },
  { key: 'plane', label: 'plane' },
  { key: 'circular', label: 'circular' },
  { key: 'cone', label: 'cone' },
  { key: 'cylinder', label: 'cylinder' },
  { key: 'torus', label: 'torus' },
  { key: 'theConduit', label: 'theConduit' }
];

const DEFAULT_MESH_COLOR = 0x60a5fa;

function makeEmissiveMaterial(color: number) {
  // 自带 emissive 可在弱光环境下看清形体；roughness/metalness 为朴素 PBR 占位
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.05,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.6
  });
}

function applyTransform(root: THREE.Object3D, opts?: CreateDefaultModelOptions) {
  if (!opts) return;
  if (opts.position) root.position.set(opts.position.x, opts.position.y, opts.position.z);
  if (opts.rotation) root.rotation.set(opts.rotation.x, opts.rotation.y, opts.rotation.z);
  if (typeof opts.scale === 'number') root.scale.setScalar(opts.scale);
}

function withDefaultUserData(root: THREE.Object3D, key: DefaultModelKey) {
  // userData is intentionally flexible; we use it as a lightweight bridge for UI.
  (root.userData as any).__vizonDefaultModel = true;
  (root.userData as any).__vizonDefaultModelKey = key;
}

export function createDefaultModel(key: DefaultModelKey, opts?: CreateDefaultModelOptions) {
  const mat = makeEmissiveMaterial(DEFAULT_MESH_COLOR);
  let mesh: THREE.Mesh;

  switch (key) {
    case 'cube': {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      mesh.name = 'BoxGeometry';
      mesh.position.set(0, 0.5, 0);
      break;
    }
    case 'sphere': {
      // 降低默认分段，兼顾视觉与编辑器实时性能。
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.65, 32, 18), mat);
      mesh.name = 'SphereGeometry';
      mesh.position.set(0, 0.65, 0);
      break;
    }
    case 'plane': {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      mesh.name = 'PlaneGeometry';
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0, 0);
      break;
    }
    case 'circular': {
      mesh = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), mat);
      mesh.name = 'CircleGeometry';
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.02, 0);
      break;
    }
    case 'cone': {
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 24), mat);
      mesh.name = 'ConeGeometry';
      mesh.position.set(0, 0.6, 0);
      break;
    }
    case 'cylinder': {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 24), mat);
      mesh.name = 'CylinderGeometry';
      mesh.position.set(0, 0.6, 0);
      break;
    }
    case 'torus': {
      mesh = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.18, 12, 48), mat);
      mesh.name = 'TorusGeometry';
      mesh.position.set(0, 0.6, 0);
      break;
    }
    case 'theConduit': {
      // A lightweight “pipe” approximation: tube along a curve.
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.6, 0.0, -0.2),
        new THREE.Vector3(-0.2, 0.2, 0.1),
        new THREE.Vector3(0.2, -0.1, 0.25),
        new THREE.Vector3(0.6, 0.0, 0.0)
      ]);
      mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.14, 12, false), mat);
      mesh.name = 'TubeGeometry';
      mesh.position.set(0, 0.65, 0);
      break;
    }
  }

  withDefaultUserData(mesh, key);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  applyTransform(mesh, opts);
  return mesh;
}

