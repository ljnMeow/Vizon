/** `sceneSettingsDiff` / dirty 映射。 */
import { describe, expect, it } from 'vitest';
import { createDefaultSceneSettings } from '../sceneSettings';
import type { SceneSettings } from '../sceneSettings';
import { calcSceneSettingsDiff, mapSceneDiffToDirtyFlags } from '../sceneSettingsDiff';

function cloneSettings(): SceneSettings {
  return structuredClone(createDefaultSceneSettings());
}

describe('calcSceneSettingsDiff', () => {
  it('returns all false when settings are equal', () => {
    const a = cloneSettings();
    const b = cloneSettings();
    expect(calcSceneSettingsDiff(b, a)).toEqual({
      environmentChanged: false,
      rendererChanged: false,
      cameraChanged: false,
      gridChanged: false,
      helpersChanged: false,
    });
  });

  it('detects environment backgroundColor change', () => {
    const prev = cloneSettings();
    const next = cloneSettings();
    next.environment = {
      ...next.environment,
      backgroundColor: '#ff0000',
      fog: { ...next.environment.fog },
      hdri: { type: 'none' },
    };
    const d = calcSceneSettingsDiff(next, prev);
    expect(d.environmentChanged).toBe(true);
    expect(d.rendererChanged).toBe(false);
  });

  it('detects hdri url change only when both sides are uploaded', () => {
    const prev = cloneSettings();
    prev.environment.hdri = { type: 'uploaded', url: 'blob:a' };
    const next = cloneSettings();
    next.environment.hdri = { type: 'uploaded', url: 'blob:b' };
    next.environment.fog = { ...next.environment.fog };
    expect(calcSceneSettingsDiff(next, prev).environmentChanged).toBe(true);
  });

  it('does not compare urls when hdri type crosses none/uploaded', () => {
    const prev = cloneSettings();
    prev.environment.hdri = { type: 'none' };
    const next = cloneSettings();
    next.environment.hdri = { type: 'uploaded', url: 'blob:x' };
    next.environment.fog = { ...next.environment.fog };
    expect(calcSceneSettingsDiff(next, prev).environmentChanged).toBe(true);
  });

  it('detects renderer antialias change', () => {
    const prev = cloneSettings();
    const next = cloneSettings();
    next.renderer = { ...next.renderer, antialias: !prev.renderer.antialias };
    expect(calcSceneSettingsDiff(next, prev).rendererChanged).toBe(true);
  });

  it('detects camera fov change', () => {
    const prev = cloneSettings();
    const next = cloneSettings();
    next.camera = { ...next.camera, fov: prev.camera.fov + 1 };
    expect(calcSceneSettingsDiff(next, prev).cameraChanged).toBe(true);
  });

  it('detects grid opacity change', () => {
    const prev = cloneSettings();
    const next = cloneSettings();
    next.grid = { ...next.grid, opacity: 0.1 };
    expect(calcSceneSettingsDiff(next, prev).gridChanged).toBe(true);
  });

  it('detects helpers axes size change', () => {
    const prev = cloneSettings();
    const next = cloneSettings();
    next.helpers = { axes: { ...next.helpers.axes, size: prev.helpers.axes.size + 0.1 } };
    expect(calcSceneSettingsDiff(next, prev).helpersChanged).toBe(true);
  });
});

describe('mapSceneDiffToDirtyFlags', () => {
  it('maps renderer-only diff', () => {
    expect(
      mapSceneDiffToDirtyFlags({
        environmentChanged: false,
        rendererChanged: true,
        cameraChanged: false,
        gridChanged: false,
        helpersChanged: false,
      })
    ).toEqual({
      rendererDirty: true,
      shadowDirty: true,
      sceneDirty: false,
    });
  });

  it('maps environment-only diff', () => {
    expect(
      mapSceneDiffToDirtyFlags({
        environmentChanged: true,
        rendererChanged: false,
        cameraChanged: false,
        gridChanged: false,
        helpersChanged: false,
      })
    ).toEqual({
      rendererDirty: false,
      shadowDirty: true,
      sceneDirty: true,
    });
  });

  it('maps grid change to sceneDirty not rendererDirty', () => {
    expect(
      mapSceneDiffToDirtyFlags({
        environmentChanged: false,
        rendererChanged: false,
        cameraChanged: false,
        gridChanged: true,
        helpersChanged: false,
      })
    ).toEqual({
      rendererDirty: false,
      shadowDirty: false,
      sceneDirty: true,
    });
  });
});
