import { describe, expect, it } from 'vitest';
import { createDefaultSceneSettings } from '../../settings/sceneSettings';
import { defaultModels, createDefaultModel } from '../defaultModels';
import { defaultCameras, createDefaultCamera } from '../defaultCameras';
import { defaultLights, createDefaultLight } from '../defaultLights';
import {
  DEFAULT_SCENE_SETTINGS,
  DEFAULT_MODELS,
  DEFAULT_CAMERAS,
  DEFAULT_LIGHTS,
  DEFAULT_LIGHT_HELPER_COLOR
} from '../registry';

describe('defaults consistency', () => {
  it('scene settings defaults should align with registry', () => {
    const settings = createDefaultSceneSettings();

    expect(settings.version).toBe(DEFAULT_SCENE_SETTINGS.version);
    expect(settings.environment.backgroundMode).toBe(DEFAULT_SCENE_SETTINGS.environment.backgroundMode);
    expect(settings.environment.backgroundColor).toBe(DEFAULT_SCENE_SETTINGS.environment.backgroundColor);
    expect(settings.environment.environmentStrength).toBe(DEFAULT_SCENE_SETTINGS.environment.environmentStrength);
    expect(settings.camera.fov).toBe(DEFAULT_SCENE_SETTINGS.camera.fov);
    expect(settings.camera.near).toBe(DEFAULT_SCENE_SETTINGS.camera.near);
    expect(settings.camera.far).toBe(DEFAULT_SCENE_SETTINGS.camera.far);
    expect(settings.grid.color).toBe(DEFAULT_SCENE_SETTINGS.grid.color);
    expect(settings.renderer.shadowMapType).toBe(DEFAULT_SCENE_SETTINGS.renderer.shadowMapType);
  });

  it('default metadata lists should align with registry', () => {
    expect(defaultModels).toEqual(DEFAULT_MODELS);
    expect(defaultCameras).toEqual(DEFAULT_CAMERAS);
    expect(defaultLights).toEqual(DEFAULT_LIGHTS);
  });

  it('factory outputs should expose default markers', () => {
    const model = createDefaultModel('cube');
    const perspectiveCamera = createDefaultCamera('perspective');
    const directionalLight = createDefaultLight('directionalLight');

    expect(Boolean((model.userData as any).__vizonDefaultModel)).toBe(true);
    expect((model.userData as any).__vizonDefaultModelKey).toBe('cube');

    expect(Boolean((perspectiveCamera.userData as any).__vizonDefaultCamera)).toBe(true);
    expect((perspectiveCamera.userData as any).__vizonDefaultCameraKey).toBe('perspective');

    expect(Boolean((directionalLight.userData as any).__vizonDefaultLight)).toBe(true);
    expect((directionalLight.userData as any).__vizonDefaultLightKey).toBe('directionalLight');
  });

  it('ambient light should use registry helper color', () => {
    const ambientLight = createDefaultLight('ambientLight');
    expect(ambientLight.color.getHex()).toBe(DEFAULT_LIGHT_HELPER_COLOR);
  });
});
