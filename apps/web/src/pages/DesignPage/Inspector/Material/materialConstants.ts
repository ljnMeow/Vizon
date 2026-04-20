// 材质类型展示顺序（同时用于下拉选项顺序）
export const materialTypeOrder = [
  'MeshBasicMaterial',
  'MeshDepthMaterial',
  'MeshNormalMaterial',
  'MeshMatcapMaterial',
  'MeshLambertMaterial',
  'MeshPhongMaterial',
  'MeshToonMaterial',
  'MeshStandardMaterial',
  'MeshPhysicalMaterial',
  'PointsMaterial',
  'LineBasicMaterial',
  'ShadowMaterial',
  'ShaderMaterial',
] as const;

export type MaterialTypeKey = (typeof materialTypeOrder)[number];
export const materialTypeSet = new Set<MaterialTypeKey>(materialTypeOrder);

// 混合模式展示顺序
export const materialBlendingOrder = [
  'NoBlending',
  'NormalBlending',
  'AdditiveBlending',
  'SubtractiveBlending',
  'MultiplyBlending',
] as const;
export type MaterialBlendingKey = (typeof materialBlendingOrder)[number];

// three.js Blending 枚举值映射
export const blendingKeyToValue: Record<MaterialBlendingKey, number> = {
  NoBlending: 0,
  NormalBlending: 1,
  AdditiveBlending: 2,
  SubtractiveBlending: 3,
  MultiplyBlending: 4,
};

// 反向映射：用于从材质实例读取 blending 数值后回填到 UI key
export const valueToBlendingKey = new Map<number, MaterialBlendingKey>(
  Object.entries(blendingKeyToValue).map(([k, v]) => [v, k as MaterialBlendingKey])
);

export const materialSideOrder = ['FrontSide', 'BackSide', 'DoubleSide'] as const;
export type MaterialSideKey = (typeof materialSideOrder)[number];
// three.js Side 枚举值映射
export const materialSideKeyToValue: Record<MaterialSideKey, number> = {
  FrontSide: 0,
  BackSide: 1,
  DoubleSide: 2,
};

export type TextureFieldKey =
  | 'map'
  | 'envMap'
  | 'alphaMap'
  | 'lightMap'
  | 'aoMap'
  | 'specularMap'
  | 'emissiveMap'
  | 'bumpMap'
  | 'normalMap'
  | 'displacementMap'
  | 'roughnessMap'
  | 'metalnessMap'
  | 'gradientMap'
  | 'anisotropyMap'
  | 'clearcoatMap'
  | 'clearcoatRoughnessMap'
  | 'clearcoatNormalMap'
  | 'iridescenceMap'
  | 'iridescenceThicknessMap'
  | 'sheenColorMap'
  | 'sheenRoughnessMap'
  | 'transmissionMap'
  | 'thicknessMap'
  | 'specularIntensityMap'
  | 'specularColorMap';

// 统一的贴图字段全集，供调试开关初始化与遍历使用
export const allTextureFieldKeys: TextureFieldKey[] = [
  'map',
  'envMap',
  'alphaMap',
  'lightMap',
  'aoMap',
  'specularMap',
  'emissiveMap',
  'bumpMap',
  'normalMap',
  'displacementMap',
  'roughnessMap',
  'metalnessMap',
  'gradientMap',
  'anisotropyMap',
  'clearcoatMap',
  'clearcoatRoughnessMap',
  'clearcoatNormalMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'specularIntensityMap',
  'specularColorMap',
];

export type TextureSupport = Partial<Record<TextureFieldKey, true>>;

// 不同材质类型支持的贴图槽白名单（只列可编辑字段）
export const textureSupportByMaterialType: Record<MaterialTypeKey, TextureSupport> = {
  MeshBasicMaterial: { map: true, envMap: true, alphaMap: true, lightMap: true, aoMap: true, specularMap: true },
  MeshLambertMaterial: {
    map: true, lightMap: true, aoMap: true, emissiveMap: true, bumpMap: true, normalMap: true,
    displacementMap: true, specularMap: true, alphaMap: true, envMap: true,
  },
  MeshPhongMaterial: {
    map: true, lightMap: true, aoMap: true, emissiveMap: true, bumpMap: true, normalMap: true,
    displacementMap: true, specularMap: true, alphaMap: true, envMap: true,
  },
  MeshStandardMaterial: {
    map: true, lightMap: true, aoMap: true, emissiveMap: true, bumpMap: true, normalMap: true,
    displacementMap: true, roughnessMap: true, metalnessMap: true, alphaMap: true, envMap: true,
  },
  MeshPhysicalMaterial: {
    map: true, lightMap: true, aoMap: true, emissiveMap: true, bumpMap: true, normalMap: true,
    displacementMap: true, roughnessMap: true, metalnessMap: true, alphaMap: true, envMap: true,
    anisotropyMap: true, clearcoatMap: true, clearcoatRoughnessMap: true, clearcoatNormalMap: true,
    iridescenceMap: true, iridescenceThicknessMap: true, sheenColorMap: true, sheenRoughnessMap: true,
    transmissionMap: true, thicknessMap: true, specularIntensityMap: true, specularColorMap: true,
  },
  MeshToonMaterial: {
    map: true, gradientMap: true, lightMap: true, aoMap: true, emissiveMap: true,
    bumpMap: true, normalMap: true, displacementMap: true, alphaMap: true,
  },
  MeshDepthMaterial: { alphaMap: true, displacementMap: true },
  MeshNormalMaterial: { bumpMap: true, normalMap: true, displacementMap: true },
  MeshMatcapMaterial: { bumpMap: true, normalMap: true, displacementMap: true, alphaMap: true },
  PointsMaterial: { map: true, alphaMap: true },
  LineBasicMaterial: { map: true, alphaMap: true },
  ShadowMaterial: {},
  ShaderMaterial: { map: true },
};
