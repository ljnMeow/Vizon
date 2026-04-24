import { getAssetUrl } from './utils';

/** 模型分类标识：基础几何体 / 环境资产 / 角色 */
export type ModelCategoryKey = 'basic' | 'environment' | 'characters';

/** 系统内置模型条目 */
export type ModelItem = {
  /** 模型唯一 key，对应 core 层 defaultModels 中的 key */
  key: string;
  /** 在资产面板中展示的缩略图 URL（通过 Vite import.meta.url 解析为绝对路径） */
  imageUrl?: string;
};

/**
 * 基础几何体模型列表（立方体、球体、平面等）。
 * 列表顺序即资产面板中的展示顺序。
 * imageUrl 使用 getAssetUrl() + import.meta.url 确保 Vite 打包后路径正确。
 */
export const basicModels: ModelItem[] = [
  { key: 'cube', imageUrl: getAssetUrl('../assets/img/box.png', import.meta.url) },
  { key: 'sphere', imageUrl: getAssetUrl('../assets/img/sphere.png', import.meta.url) },
  { key: 'plane', imageUrl: getAssetUrl('../assets/img/plane.png', import.meta.url) },
  { key: 'circular', imageUrl: getAssetUrl('../assets/img/circular.png', import.meta.url) },
  { key: 'cone', imageUrl: getAssetUrl('../assets/img/cone.png', import.meta.url) },
  { key: 'cylinder', imageUrl: getAssetUrl('../assets/img/cylinder.png', import.meta.url) },
  { key: 'torus', imageUrl: getAssetUrl('../assets/img/torus.png', import.meta.url) },
  { key: 'theConduit', imageUrl: getAssetUrl('../assets/img/theConduit.png', import.meta.url) },
  { key: 'group', imageUrl: getAssetUrl('../assets/img/group.png', import.meta.url) },
];

