export const DEFAULT_MESH_COLOR = 0x60a5fa;
export const DEFAULT_LIGHT_HELPER_COLOR = 0xffb703;

export const DEFAULT_MODELS = [
  { key: 'cube', label: 'cube' },
  { key: 'sphere', label: 'sphere' },
  { key: 'plane', label: 'plane' },
  { key: 'circular', label: 'circular' },
  { key: 'cone', label: 'cone' },
  { key: 'cylinder', label: 'cylinder' },
  { key: 'torus', label: 'torus' },
  { key: 'theConduit', label: 'theConduit' },
  { key: 'group', label: 'group' }
] as const;

export const DEFAULT_CAMERAS = [
  { key: 'orthographic', label: 'orthographic' },
  { key: 'perspective', label: 'perspective' }
] as const;

export const DEFAULT_LIGHTS = [
  { key: 'ambientLight', label: 'ambientLight' },
  { key: 'directionalLight', label: 'directionalLight' },
  { key: 'pointLight', label: 'pointLight' },
  { key: 'spotLight', label: 'spotLight' },
  { key: 'hemisphereLight', label: 'hemisphereLight' },
  { key: 'rectAreaLight', label: 'rectAreaLight' }
] as const;

export const DEFAULT_SCENE_SETTINGS = {
  version: 3,
  basic: {
    sceneName: '',
    description: ''
  },
  environment: {
    backgroundMode: 'solid',
    backgroundColor: '#f3f4f6',
    hdri: { type: 'none' as const },
    environmentStrength: 1,
    fog: {
      enabled: false,
      color: '#c7d2fe',
      near: 0.5,
      far: 10
    }
  },
  camera: {
    fov: 50,
    near: 0.01,
    far: 10_000,
    position: { x: 9.4, y: 6.0, z: 9.4 },
    target: { x: 0, y: 0.8, z: 0 }
  },
  grid: {
    enabled: true,
    color: '#334155',
    opacity: 0.8
  },
  helpers: {
    axes: {
      enabled: false,
      size: 1.5
    }
  },
  renderer: {
    antialias: true,
    outputColorSpace: 'SRGBColorSpace' as const,
    toneMapping: 'NoToneMapping' as const,
    toneMappingExposure: 1,
    shadowMapEnabled: false,
    shadowMapType: 'PCFShadowMap' as const,
    shadowMapAutoUpdate: true
  },
  sceneTree: [] as []
} as const;
