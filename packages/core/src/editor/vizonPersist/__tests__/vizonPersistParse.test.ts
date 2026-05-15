/**
 * `vizonPersistParse` 单元测试。
 * 验证文档迁移（migrateVizonDocument）、完整解析（parseVizonDocument）
 * 以及节点规范化（normalizeNode）在各种输入形状下的行为。
 */
import { describe, expect, it } from 'vitest';

// 用于构造合法 v2 文档的默认场景设置
import { createDefaultSceneSettings } from '../../../settings/sceneSettings';
import { migrateVizonDocument, normalizeNode, parseVizonDocument } from '../vizonPersistParse';

/**
 * 构造一个最小合法的 v2 文档对象，允许通过 overrides 覆盖任意顶层字段。
 * 每个测试用例可以只修改关注的字段，其余保持合法默认值。
 */
function minimalV2Doc(overrides: Record<string, unknown> = {}) {
  // 用 createDefaultSceneSettings 得到所有场景设置的合法默认值
  const s = createDefaultSceneSettings();
  return {
    // meta 字段使用固定时间戳，避免测试因时间不同而产生随机差异
    meta: { schemaVersion: 2, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
    // 以下字段使用默认设置确保文档结构合法
    basic: s.basic,
    environment: s.environment,
    camera: s.camera,
    grid: s.grid,
    helpers: s.helpers,
    renderer: s.renderer,
    sceneTree: [],      // 空场景树
    content: [],        // 空内容树
    // overrides 可以覆盖以上任意字段，也可以新增额外字段（如 nodes）
    ...overrides,
  };
}

// ============================================================
// migrateVizonDocument 测试：版本迁移逻辑
// ============================================================
describe('migrateVizonDocument', () => {
  it('throws when input is not an object', () => {
    // null 和字符串都不是有效文档对象，应立即抛错拒绝解析
    expect(() => migrateVizonDocument(null)).toThrow('Invalid VizonDocument: not an object');
    expect(() => migrateVizonDocument('x')).toThrow('Invalid VizonDocument: not an object');
  });

  it('throws for unsupported schemaVersion', () => {
    // schemaVersion=99 是未知版本，不能静默降级，必须明确报错
    expect(() =>
      migrateVizonDocument({
        meta: { schemaVersion: 99 },
        sceneSettings: createDefaultSceneSettings(),
      })
    ).toThrow('Unsupported VizonDocument schemaVersion');
  });

  it('migrates v1 to v2 shape with content cleared and sceneSettings preserved', () => {
    // v1 格式：场景设置存在 sceneSettings 内，nodes 数组包含节点列表，无 content 字段
    const sceneSettings = createDefaultSceneSettings();
    const migrated = migrateVizonDocument({
      meta: { schemaVersion: 1, createdAt: '2021-06-01T00:00:00.000Z', updatedAt: '2021-06-02T00:00:00.000Z' },
      sceneSettings,
      nodes: [{ id: 'a', name: 'N' }],
    });
    // 迁移后 schemaVersion 必须升级为 2
    expect(migrated.meta.schemaVersion).toBe(2);
    // v1 → v2 迁移时 content 清空（v1 没有 objectSnapshot，内容由 sceneSnapshot/nodes 恢复）
    expect(migrated.content).toEqual([]);
    // sceneSettings 保留供后续 normalizeVizonDocument 使用
    expect(migrated.sceneSettings).toBeDefined();
    // nodes 数组保留（v1 导入路径会从这里恢复对象）
    expect(Array.isArray(migrated.nodes)).toBe(true);
  });
});

// ============================================================
// parseVizonDocument 测试：完整解析流程（迁移 + normalize）
// ============================================================
describe('parseVizonDocument', () => {
  it('normalizes a v2 document', () => {
    // 最小 v2 文档经过完整解析后，各字段应有合法默认值
    const doc = parseVizonDocument(minimalV2Doc());
    // schemaVersion 保持 2
    expect(doc.meta.schemaVersion).toBe(2);
    // sceneTree 是数组（normalize 保证）
    expect(doc.sceneTree).toEqual([]);
    // content 是数组
    expect(Array.isArray(doc.content)).toBe(true);
  });

  it('parses v1 through migrate + normalize', () => {
    // v1 文档先经过 migrateVizonDocument 升级为 v2，再经 normalizeVizonDocument 规范化
    const doc = parseVizonDocument({
      meta: { schemaVersion: 1, createdAt: '2021-01-01T00:00:00.000Z', updatedAt: '2021-01-01T00:00:00.000Z' },
      sceneSettings: createDefaultSceneSettings(),
    });
    // 最终结果的 schemaVersion 必须是 2
    expect(doc.meta.schemaVersion).toBe(2);
  });

  it('normalizes nodes on v2 when present', () => {
    // nodes 字段存在时，parseVizonDocument 内部会逐个调用 normalizeNode
    const doc = parseVizonDocument(
      minimalV2Doc({
        nodes: [
          {
            id: 'root-1',
            name: 'Root',
            type: 'Group',
            parentId: null,          // null 表示根节点
            children: [],
            visible: true,
            layers: [0, 1],           // 同时出现在第 0 层和第 1 层
            position: { x: 1, y: 2, z: 3 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },  // 单位四元数（无旋转）
            scale: { x: 1, y: 1, z: 1 },
          },
        ],
      })
    );
    // 规范化后 nodes 包含 1 个节点
    expect(doc.nodes).toHaveLength(1);
    // id 保持不变
    expect(doc.nodes![0].id).toBe('root-1');
    // layers 包含 0（第 0 层在过滤后保留）
    expect(doc.nodes![0].layers).toContain(0);
  });
});

// ============================================================
// normalizeNode 测试：单节点规范化
// ============================================================
describe('normalizeNode', () => {
  it('throws when input is not an object', () => {
    // null 不是对象，无法提取任何字段，应立即抛错
    expect(() => normalizeNode(null)).toThrow('Invalid node: not an object');
  });

  it('throws when id is missing or empty', () => {
    // 缺少 id 字段时，id 会被 toString 解析为空字符串，然后抛错
    expect(() => normalizeNode({})).toThrow('Invalid node.id');
    // 空字符串 id 也不合法（节点必须有唯一非空标识符）
    expect(() => normalizeNode({ id: '' })).toThrow('Invalid node.id');
  });

  it('fills defaults for minimal valid node', () => {
    // 仅提供 id、parentId、children 三个字段，其余应全部使用合法默认值
    const n = normalizeNode({
      id: 'n1',
      parentId: null,    // null 表示根节点
      children: [],
    });
    expect(n.id).toBe('n1');
    // 缺少 type 时默认为 Object3D（最通用的 Three.js 类型）
    expect(n.type).toBe('Object3D');
    // 缺少 visible 时默认可见
    expect(n.visible).toBe(true);
    // 缺少 layers 时默认在第 0 层（默认可见层）
    expect(n.layers).toEqual([0]);
    // 缺少 position 时默认在原点
    expect(n.position).toEqual({ x: 0, y: 0, z: 0 });
    // 缺少 scale 时默认为 (1,1,1)（不缩放）
    expect(n.scale).toEqual({ x: 1, y: 1, z: 1 });
    // 缺少 quaternion 时默认为单位四元数（无旋转）
    expect(n.quaternion).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it('filters invalid layer indices', () => {
    // layers 过滤规则：只保留 0-31 范围内的整数
    // -1：负数，非法
    // 0：合法
    // 31：最大合法层（Three.js 共 32 层，0-31）
    // 32：超出范围，非法
    // 1.5：小数，非整数，非法
    const n = normalizeNode({
      id: 'n2',
      layers: [-1, 0, 31, 32, 1.5],
    });
    // 过滤后只保留 0 和 31
    expect(n.layers).toEqual([0, 31]);
  });
});
