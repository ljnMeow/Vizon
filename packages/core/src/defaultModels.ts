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

function makeEmissiveMaterial(color: number) {
  // Scene currently doesn't manage lights yet; emissive keeps meshes visible.
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
  const group = new THREE.Group();
  withDefaultUserData(group, key);
  group.name = `DefaultModel:${key}`;

  // Basic palette to keep models distinguishable even without lights.
  const palette: Record<DefaultModelKey, number> = {
    cube: 0x60a5fa,
    sphere: 0x34d399,
    plane: 0x93c5fd,
    circular: 0xfbbf24,
    cone: 0xf472b6,
    cylinder: 0xa78bfa,
    torus: 0x22c55e,
    theConduit: 0x60a5fa
  };

  const mat = makeEmissiveMaterial(palette[key]);

  switch (key) {
    case 'cube': {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      mesh.position.set(0, 0.5, 0);
      group.add(mesh);
      break;
    }
    case 'sphere': {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.65, 64, 32), mat);
      mesh.position.set(0, 0.65, 0);
      group.add(mesh);
      break;
    }
    case 'plane': {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0, 0);
      group.add(mesh);
      break;
    }
    case 'circular': {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.75, 64), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.02, 0);
      group.add(mesh);
      break;
    }
    case 'cone': {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 48), mat);
      mesh.position.set(0, 0.6, 0);
      group.add(mesh);
      break;
    }
    case 'cylinder': {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 48), mat);
      mesh.position.set(0, 0.6, 0);
      group.add(mesh);
      break;
    }
    case 'torus': {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.18, 16, 100), mat);
      mesh.position.set(0, 0.6, 0);
      group.add(mesh);
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
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.14, 16, false), mat);
      mesh.position.set(0, 0.65, 0);
      group.add(mesh);
      break;
    }
  }

  applyTransform(group, opts);
  return group;
}

