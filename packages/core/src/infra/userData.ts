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
  [VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_HANDLE]?: boolean;
  [VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_UUID]?: string;
  [VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_LIGHT_TYPE]?: string;

  [VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER]?: THREE.CameraHelper;
  [VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER]?: THREE.Object3D;
  [VIZON_USER_DATA_KEYS.HELPERS.SHADOW_HELPER_VISIBLE]?: boolean;
  [VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE]?: THREE.Object3D;

  [VIZON_USER_DATA_KEYS.CONDUIT.EDIT_ENABLED]?: boolean;
};

export type VizonObject3D = THREE.Object3D & { userData: VizonUserData };

export function getVizonUserData(obj: THREE.Object3D): VizonUserData {
  return (obj.userData ?? {}) as VizonUserData;
}

