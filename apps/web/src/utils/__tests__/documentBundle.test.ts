import { beforeEach, describe, expect, it, vi } from 'vitest';

const { importDocumentMock } = vi.hoisted(() => ({
  importDocumentMock: vi.fn()
}));

vi.mock('vizon-3d-core', () => ({
  importDocument: importDocumentMock,
  loadEquirectEnvMapTextureFromFile: vi.fn(),
  loadImageTextureFromFile: vi.fn()
}));

import type { VizonDocument } from 'vizon-3d-core';

import { buildProjectBundle, importProjectBundle } from '../documentBundle';
import { cacheTextureAssetFile } from '../textureAssetSession';
import { createStoredZip, parseStoredZip } from '../zipStore';

function makeFile(bytes: Uint8Array, name: string, options: { type: string; lastModified?: number }) {
  const file = new File([bytes], name, options) as File & { arrayBuffer: () => Promise<ArrayBuffer> };
  file.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return file as File;
}

function blobToArrayBuffer(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob.'));
    reader.readAsArrayBuffer(blob);
  });
}

function createBaseDocument(): VizonDocument {
  return {
    meta: {
      schemaVersion: 2,
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: '2026-05-14T00:00:00.000Z',
      upAxis: 'y',
      units: 'meter'
    },
    basic: { sceneName: 'scene', description: '' },
    environment: {
      backgroundMode: 'skybox',
      backgroundColor: '#ffffff',
      hdri: { type: 'none' as const },
      environmentStrength: 1,
      fog: { enabled: false, color: '#ffffff', near: 0, far: 10 }
    },
    camera: {
      fov: 50,
      near: 0.01,
      far: 1000,
      position: { x: 0, y: 0, z: 1 },
      target: { x: 0, y: 0, z: 0 }
    },
    grid: { enabled: true, color: '#000000', opacity: 1 },
    helpers: { axes: { enabled: true, size: 1 } },
    renderer: {
      antialias: true,
      outputColorSpace: 'SRGBColorSpace',
      toneMapping: 'NoToneMapping',
      toneMappingExposure: 1,
      shadowMapEnabled: false,
      shadowMapType: 'PCFSoftShadowMap',
      shadowMapAutoUpdate: true
    },
    sceneTree: [],
    content: [],
    assets: {}
  };
}

describe('documentBundle', () => {
  beforeEach(() => {
    importDocumentMock.mockReset();
    vi.restoreAllMocks();
    if (!('createObjectURL' in URL)) {
      Object.defineProperty(URL, 'createObjectURL', {
        value: vi.fn(() => 'blob:mock-object-url'),
        configurable: true,
        writable: true
      });
    }
  });

  it('exports uploaded environment hdri as bundled asset', async () => {
    const hdriFile = makeFile(new Uint8Array([1, 2, 3]), 'sky.hdr', { type: 'image/vnd.radiance', lastModified: 123 });
    const ref = await cacheTextureAssetFile(hdriFile);

    const editor = {
      scene: { traverse: (_fn: (object: any) => void) => {} },
      getSceneSettings: () => ({
        environment: {
          hdri: {
            type: 'uploaded' as const,
            assetId: ref.id,
            url: 'blob:runtime',
            fileName: 'sky.hdr',
            mimeType: 'image/vnd.radiance'
          }
        }
      }),
      getVizonDocument: () => {
        const document = createBaseDocument();
        document.environment.hdri = {
          type: 'uploaded',
          assetId: ref.id,
          url: 'blob:runtime',
          fileName: 'sky.hdr',
          mimeType: 'image/vnd.radiance'
        };
        return document;
      }
    } as any;

    const bundle = await buildProjectBundle(editor);
    const zip = parseStoredZip(new Uint8Array(await blobToArrayBuffer(bundle.blob)));
    const sceneJson = JSON.parse(new TextDecoder().decode(zip.get('scene.json')!));

    expect(sceneJson.assets.textures.environmentHdriAssetId).toBe(ref.id);
    expect(zip.get(`assets/textures/${ref.id}.hdr`)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('backfills uploaded environment hdri asset from legacy blob url during export', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      blob: async () => new Blob([new Uint8Array([4, 5, 6])], { type: 'image/vnd.radiance' })
    } as Response);

    const editor = {
      scene: { traverse: (_fn: (object: any) => void) => {} },
      getSceneSettings: () => ({
        environment: {
          hdri: {
            type: 'uploaded' as const,
            url: 'blob:legacy-env',
            fileName: 'legacy-sky.hdr',
            mimeType: 'image/vnd.radiance'
          }
        }
      }),
      getVizonDocument: () => {
        const document = createBaseDocument();
        document.environment.hdri = {
          type: 'uploaded',
          url: 'blob:legacy-env',
          fileName: 'legacy-sky.hdr',
          mimeType: 'image/vnd.radiance'
        };
        return document;
      }
    } as any;

    const bundle = await buildProjectBundle(editor);
    const zip = parseStoredZip(new Uint8Array(await blobToArrayBuffer(bundle.blob)));
    const sceneJson = JSON.parse(new TextDecoder().decode(zip.get('scene.json')!));
    const envAssetId = sceneJson.assets.textures.environmentHdriAssetId;

    expect(fetchSpy).toHaveBeenCalledWith('blob:legacy-env');
    expect(typeof envAssetId).toBe('string');
    expect(sceneJson.environment.hdri.assetId).toBe(envAssetId);
    expect(zip.get(`assets/textures/${envAssetId}.hdr`)).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('rebuilds uploaded environment hdri before importing document', async () => {
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:restored-hdri');

    const document = createBaseDocument();
    document.environment.hdri = {
      type: 'uploaded',
      url: 'blob:stale',
      fileName: 'old.hdr',
      mimeType: 'image/vnd.radiance'
    };
    document.assets = {
      textures: {
        items: {
          'env-asset': {
            id: 'env-asset',
            path: 'assets/textures/env-asset.hdr',
            originalName: 'sky.hdr',
            mimeType: 'image/vnd.radiance',
            size: 3,
            lastModified: 456
          }
        },
        bindings: [],
        environmentHdriAssetId: 'env-asset'
      }
    };

    const sceneBytes = new TextEncoder().encode(JSON.stringify(document, null, 2));
    const zipBytes = createStoredZip([
      { path: 'scene.json', data: sceneBytes },
      { path: 'assets/textures/env-asset.hdr', data: new Uint8Array([9, 8, 7]), lastModified: 456 }
    ]);

    const file = makeFile(zipBytes, 'project.vizon', { type: 'application/zip' });
    const editor = {
      scene: { traverse: (_fn: (object: any) => void) => {} },
      render: vi.fn()
    } as any;

    await importProjectBundle(editor, file);

    expect(importDocumentMock).toHaveBeenCalledTimes(1);
    const importedDocument = importDocumentMock.mock.calls[0][1];
    expect(importedDocument.environment.hdri).toMatchObject({
      type: 'uploaded',
      assetId: 'env-asset',
      url: 'blob:restored-hdri',
      fileName: 'sky.hdr',
      mimeType: 'image/vnd.radiance'
    });
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(editor.render).toHaveBeenCalledTimes(1);
  });

  it('downgrades stale uploaded hdri when old bundle has no asset payload', async () => {
    const document = createBaseDocument();
    document.environment.hdri = {
      type: 'uploaded',
      url: 'blob:stale',
      fileName: 'old.hdr',
      mimeType: 'image/vnd.radiance'
    };
    document.assets = {
      textures: {
        items: {},
        bindings: []
      }
    };

    const sceneBytes = new TextEncoder().encode(JSON.stringify(document, null, 2));
    const file = makeFile(createStoredZip([{ path: 'scene.json', data: sceneBytes }]), 'project.vizon', { type: 'application/zip' });
    const editor = {
      scene: { traverse: (_fn: (object: any) => void) => {} },
      render: vi.fn()
    } as any;

    await importProjectBundle(editor, file);

    const importedDocument = importDocumentMock.mock.calls[0][1];
    expect(importedDocument.environment.hdri).toEqual({ type: 'none' });
  });
});
