/** `vizonPersistParse`：文档迁移、normalize、节点形状。 */
import { describe, expect, it } from 'vitest';

import { createDefaultSceneSettings } from '../../../settings/sceneSettings';
import { migrateVizonDocument, normalizeNode, parseVizonDocument } from '../vizonPersistParse';

function minimalV2Doc(overrides: Record<string, unknown> = {}) {
  const s = createDefaultSceneSettings();
  return {
    meta: { schemaVersion: 2, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
    basic: s.basic,
    environment: s.environment,
    camera: s.camera,
    grid: s.grid,
    helpers: s.helpers,
    renderer: s.renderer,
    sceneTree: [],
    content: [],
    ...overrides,
  };
}

describe('migrateVizonDocument', () => {
  it('throws when input is not an object', () => {
    expect(() => migrateVizonDocument(null)).toThrow('Invalid VizonDocument: not an object');
    expect(() => migrateVizonDocument('x')).toThrow('Invalid VizonDocument: not an object');
  });

  it('throws for unsupported schemaVersion', () => {
    expect(() =>
      migrateVizonDocument({
        meta: { schemaVersion: 99 },
        sceneSettings: createDefaultSceneSettings(),
      })
    ).toThrow('Unsupported VizonDocument schemaVersion');
  });

  it('migrates v1 to v2 shape with content cleared and sceneSettings preserved', () => {
    const sceneSettings = createDefaultSceneSettings();
    const migrated = migrateVizonDocument({
      meta: { schemaVersion: 1, createdAt: '2021-06-01T00:00:00.000Z', updatedAt: '2021-06-02T00:00:00.000Z' },
      sceneSettings,
      nodes: [{ id: 'a', name: 'N' }],
    });
    expect(migrated.meta.schemaVersion).toBe(2);
    expect(migrated.content).toEqual([]);
    expect(migrated.sceneSettings).toBeDefined();
    expect(Array.isArray(migrated.nodes)).toBe(true);
  });
});

describe('parseVizonDocument', () => {
  it('normalizes a v2 document', () => {
    const doc = parseVizonDocument(minimalV2Doc());
    expect(doc.meta.schemaVersion).toBe(2);
    expect(doc.sceneTree).toEqual([]);
    expect(Array.isArray(doc.content)).toBe(true);
  });

  it('parses v1 through migrate + normalize', () => {
    const doc = parseVizonDocument({
      meta: { schemaVersion: 1, createdAt: '2021-01-01T00:00:00.000Z', updatedAt: '2021-01-01T00:00:00.000Z' },
      sceneSettings: createDefaultSceneSettings(),
    });
    expect(doc.meta.schemaVersion).toBe(2);
  });

  it('normalizes nodes on v2 when present', () => {
    const doc = parseVizonDocument(
      minimalV2Doc({
        nodes: [
          {
            id: 'root-1',
            name: 'Root',
            type: 'Group',
            parentId: null,
            children: [],
            visible: true,
            layers: [0, 1],
            position: { x: 1, y: 2, z: 3 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        ],
      })
    );
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes![0].id).toBe('root-1');
    expect(doc.nodes![0].layers).toContain(0);
  });
});

describe('normalizeNode', () => {
  it('throws when input is not an object', () => {
    expect(() => normalizeNode(null)).toThrow('Invalid node: not an object');
  });

  it('throws when id is missing or empty', () => {
    expect(() => normalizeNode({})).toThrow('Invalid node.id');
    expect(() => normalizeNode({ id: '' })).toThrow('Invalid node.id');
  });

  it('fills defaults for minimal valid node', () => {
    const n = normalizeNode({
      id: 'n1',
      parentId: null,
      children: [],
    });
    expect(n.id).toBe('n1');
    expect(n.type).toBe('Object3D');
    expect(n.visible).toBe(true);
    expect(n.layers).toEqual([0]);
    expect(n.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(n.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(n.quaternion).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it('filters invalid layer indices', () => {
    const n = normalizeNode({
      id: 'n2',
      layers: [-1, 0, 31, 32, 1.5],
    });
    expect(n.layers).toEqual([0, 31]);
  });
});

