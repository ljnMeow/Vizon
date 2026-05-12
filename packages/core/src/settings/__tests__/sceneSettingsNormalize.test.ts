import { describe, expect, it } from 'vitest';
import { createDefaultSceneSettings, normalizeSceneSettings } from '../sceneSettings';
import type { SceneSettings } from '../sceneSettings';

function clone(): SceneSettings {
  return structuredClone(createDefaultSceneSettings());
}

describe('normalizeSceneSettings', () => {
  it('normalizes hex colors to #rrggbb', () => {
    const input = clone();
    input.environment.backgroundColor = 'rgb(255, 0, 0)';
    input.environment.fog = { ...input.environment.fog, color: '#abc' };
    input.grid.color = 'white';
    const out = normalizeSceneSettings(input);
    expect(out.environment.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(out.environment.fog.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(out.grid.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('clamps camera fov to [10, 120]', () => {
    const input = clone();
    input.camera.fov = 200;
    expect(normalizeSceneSettings(input).camera.fov).toBe(120);
    input.camera.fov = 1;
    expect(normalizeSceneSettings(input).camera.fov).toBe(10);
  });

  it('ensures camera far is strictly greater than near', () => {
    const input = clone();
    input.camera.near = 50;
    input.camera.far = 50;
    const out = normalizeSceneSettings(input);
    expect(out.camera.far).toBeGreaterThan(out.camera.near);
  });

  it('falls back unknown toneMapping to NoToneMapping', () => {
    const input = clone();
    (input.renderer as { toneMapping: string }).toneMapping = 'UnknownToneMapping';
    expect(normalizeSceneSettings(input).renderer.toneMapping).toBe('NoToneMapping');
  });

  it('keeps ACESFilmicToneMapping when set', () => {
    const input = clone();
    input.renderer.toneMapping = 'ACESFilmicToneMapping';
    expect(normalizeSceneSettings(input).renderer.toneMapping).toBe('ACESFilmicToneMapping');
  });

  it('maps unknown outputColorSpace to SRGBColorSpace except LinearSRGB', () => {
    const input = clone();
    (input.renderer as { outputColorSpace: string }).outputColorSpace = 'bogus';
    expect(normalizeSceneSettings(input).renderer.outputColorSpace).toBe('SRGBColorSpace');
    input.renderer.outputColorSpace = 'LinearSRGBColorSpace';
    expect(normalizeSceneSettings(input).renderer.outputColorSpace).toBe('LinearSRGBColorSpace');
  });

  it('maps unknown shadowMapType to PCFShadowMap', () => {
    const input = clone();
    (input.renderer as { shadowMapType: string }).shadowMapType = 'VSMShadowMap';
    expect(normalizeSceneSettings(input).renderer.shadowMapType).toBe('PCFShadowMap');
  });

  it('clamps toneMappingExposure to [0, 10]', () => {
    const input = clone();
    input.renderer.toneMappingExposure = 999;
    expect(normalizeSceneSettings(input).renderer.toneMappingExposure).toBe(10);
    input.renderer.toneMappingExposure = -5;
    expect(normalizeSceneSettings(input).renderer.toneMappingExposure).toBe(0);
  });

  it('clamps environmentStrength to [0, 5]', () => {
    const input = clone();
    input.environment.environmentStrength = 100;
    expect(normalizeSceneSettings(input).environment.environmentStrength).toBe(5);
  });

  it('normalizes scene tree nodes with invalid kind to object', () => {
    const input = clone();
    input.sceneTree = [
      {
        uuid: '1',
        name: 'A',
        type: 'Mesh',
        visible: true,
        kind: 'invalid' as 'object',
        children: [],
      },
    ];
    const out = normalizeSceneSettings(input);
    expect(out.sceneTree[0].kind).toBe('object');
    expect(out.sceneTree[0].uuid).toBe('1');
  });

  it('is stable when applied twice (idempotent normalization)', () => {
    const input = clone();
    input.camera.fov = 77;
    input.grid.opacity = 0.33;
    const once = normalizeSceneSettings(input);
    const twice = normalizeSceneSettings(once);
    expect(twice).toEqual(once);
  });
});
