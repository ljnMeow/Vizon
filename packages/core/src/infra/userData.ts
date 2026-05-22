/**
 * **`userData` 类型收窄**：把 `THREE.Object3D['userData']` 与 Vizon 约定的 key（`VIZON_USER_DATA_KEYS`）映射为
 * 只读结构化类型，供 TS 在读取 `nonSelectable`、默认模型 key 等字段时获得补全。
 */
import * as THREE from 'three';
import { VIZON_USER_DATA_KEYS } from './utils/keys';
import type { DefaultLightKey } from '../defaults/defaultLights';
import type { DefaultCameraKey } from '../defaults/defaultCameras';
import type { DefaultModelKey } from '../defaults/defaultModels';

export type VizonUserData = {
  [VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE]?: boolean;
  [VIZON_USER_DATA_KEYS.COMMON.NON_PICKABLE]?: boolean;
  [VIZON_USER_DATA_KEYS.COMMON.DYNAMIC]?: boolean;
  [VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET]?: THREE.Object3D;
  [VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR]?: boolean;

  [VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_MODEL]?: boolean;
  [VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_MODEL_KEY]?: DefaultModelKey;
  [VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_LIGHT]?: boolean;
  [VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_LIGHT_KEY]?: DefaultLightKey;
  [VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_CAMERA]?: boolean;
  [VIZON_USER_DATA_KEYS.DEFAULTS.DEFAULT_CAMERA_KEY]?: DefaultCameraKey;
  [VIZON_USER_DATA_KEYS.DEFAULTS.RECT_AREA_LIGHT_TARGET]?: { x: number; y: number; z: number };
  [VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET]?: { x: number; y: number; z: number };
  [VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_HANDLE]?: boolean;
  [VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_UUID]?: string;
  [VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_TYPE]?: string;

  [VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER]?: THREE.CameraHelper;
  [VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER]?: THREE.Object3D;
  [VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE]?: boolean;
  [VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE]?: THREE.Object3D;

  [VIZON_USER_DATA_KEYS.CONDUIT.EDIT_ENABLED]?: boolean;

  [VIZON_USER_DATA_KEYS.AUTOSCALE.ORIGINAL_MAX_DIM]?: number;
  [VIZON_USER_DATA_KEYS.AUTOSCALE.SCALE_FACTOR]?: number;
  [VIZON_USER_DATA_KEYS.AUTOSCALE.APPLIED]?: boolean;
};

export type VizonObject3D = THREE.Object3D & { userData: VizonUserData };

export function getVizonUserData(obj?: THREE.Object3D | null): VizonUserData {
  if (!obj) return {} as VizonUserData;
  return (obj.userData ?? {}) as VizonUserData;
}

