import { getAssetUrl } from './utils';

export type ModelCategoryKey = 'basic' | 'environment' | 'characters';

export type ModelItem = {
  key: string;
  imageUrl?: string;
};

export const basicModels: ModelItem[] = [
  { key: 'cube', imageUrl: getAssetUrl('../assets/img/box.png', import.meta.url) },
  { key: 'sphere', imageUrl: getAssetUrl('../assets/img/sphere.png', import.meta.url) },
  { key: 'plane', imageUrl: getAssetUrl('../assets/img/plane.png', import.meta.url) },
  { key: 'circular', imageUrl: getAssetUrl('../assets/img/circular.png', import.meta.url) },
  { key: 'cone', imageUrl: getAssetUrl('../assets/img/cone.png', import.meta.url) },
  { key: 'cylinder', imageUrl: getAssetUrl('../assets/img/cylinder.png', import.meta.url) },
  { key: 'torus', imageUrl: getAssetUrl('../assets/img/torus.png', import.meta.url) },
  { key: 'theConduit', imageUrl: getAssetUrl('../assets/img/theConduit.png', import.meta.url) },
];

