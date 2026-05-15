/**
 * **VizonDocument 解析与迁移**：将任意 `unknown` 输入规范为内部使用的 `VizonDocument`。
 *
 * 三个公开入口函数：
 * - `parseVizonDocument`：完整流程（迁移 → normalizeVizonDocument → normalizeNode）
 * - `migrateVizonDocument`：仅做版本分支迁移，将低版本文档升级到当前 v2 形状
 * - `normalizeNode`：将单个 VizonNode 字段做类型安全强制转换，供测试与导入链复用
 */
import { normalizeSceneSettings } from '../../settings/sceneSettings';
import type { SceneSettings } from '../../settings/sceneSettings';
import type { VizonContentNode, VizonDocument, VizonNode, VizonQuat, VizonVec3 } from '../../types/document';
import { isRecord, nowIso, toBool, toFiniteNumber, toQuat, toString, toVec3 } from './vizonPersistShared';

/**
 * 完整的解析流程：迁移版本 → 规范化字段。
 * 是导入链的第一步，调用方（importDocument）直接使用此函数。
 */
export function parseVizonDocument(input: unknown): VizonDocument {
  // 第一步：将 unknown 输入按 schemaVersion 分支升级到 v2 形状
  const migrated = migrateVizonDocument(input);
  // 第二步：在 v2 形状基础上做字段规范化（填默认值、去除非法值等）
  return normalizeVizonDocument(migrated);
}

/**
 * 按 schemaVersion 分支将旧版文档迁移到当前 v2 结构。
 *
 * 规则：
 * - 新版本发布时只在此追加新的 `if (schemaVersion === N)` 分支
 * - 所有分支最终都返回 v2 形状的 VizonDocument
 * - 未知版本直接抛错，避免静默读入损坏数据
 */
export function migrateVizonDocument(input: unknown): VizonDocument {
  // 外部输入必须是对象，原始类型（字符串、数字、null）直接拒绝
  if (!isRecord(input)) throw new Error('Invalid VizonDocument: not an object');
  // 读取 meta 字段，允许缺失（旧极早期格式可能无 meta）
  const meta = isRecord(input.meta) ? input.meta : null;
  // 安全地读取版本号，格式异常时得到 NaN（后续分支不会匹配，最终进入 throw）
  const schemaVersion = meta ? toFiniteNumber(meta.schemaVersion, NaN) : NaN;

  // ——— v2 分支：当前最新格式 ———
  if (schemaVersion === 2) {
    // v2 文档的字段形状已经是目标形状，直接透传并补全可选字段
    return {
      meta: {
        schemaVersion: 2,
        // 时间字段若缺失则用当前时间填充，保证 meta 永远有合法时间戳
        createdAt: toString(meta?.createdAt, nowIso()),
        updatedAt: toString(meta?.updatedAt, nowIso()),
        // generator 是可选字段，仅字符串类型时保留，否则 undefined（不写入 JSON）
        generator: typeof meta?.generator === 'string' ? meta.generator : undefined,
        // 单位：仅接受三种合法值，其余置为 undefined 由后续 normalize 填默认
        units: meta?.units === 'centimeter' || meta?.units === 'millimeter' || meta?.units === 'meter' ? meta.units : undefined,
        // 坐标轴朝向：仅接受 'z' 或 'y'
        upAxis: meta?.upAxis === 'z' || meta?.upAxis === 'y' ? meta.upAxis : undefined,
      },
      // 以下字段直接透传 as any，后续 normalizeVizonDocument 会做完整的类型规范化
      basic: (input.basic as any) ?? {},
      environment: (input.environment as any) ?? {},
      camera: (input.camera as any) ?? {},
      grid: (input.grid as any) ?? {},
      helpers: (input.helpers as any) ?? {},
      renderer: (input.renderer as any) ?? {},
      // sceneTree 必须是数组，否则填空数组
      sceneTree: Array.isArray(input.sceneTree) ? (input.sceneTree as any) : [],
      // content 必须是数组，否则填空数组
      content: Array.isArray(input.content) ? (input.content as any) : [],
      // 以下为兼容字段，用于向下兼容旧版导出格式，保留原样
      sceneSettings: isRecord(input.sceneSettings) ? (input.sceneSettings as any) : undefined,
      sceneSnapshot: isRecord(input.sceneSnapshot) ? (input.sceneSnapshot as any) : undefined,
      nodes: Array.isArray(input.nodes) ? (input.nodes as any) : undefined,
      assets: isRecord(input.assets) ? (input.assets as any) : undefined,
    };
  }

  // ——— v1 分支：将 v1（含 sceneSettings 字段的旧格式）迁移为 v2 ———
  if (schemaVersion === 1) {
    // v1 把所有场景设置存在 sceneSettings 对象中，v2 将它们展平到文档顶层
    // normalizeSceneSettings 负责填充默认值并去除非法字段
    const sceneSettings = normalizeSceneSettings((input.sceneSettings as any) as SceneSettings);
    return {
      meta: {
        schemaVersion: 2,                                 // 升级为 v2 版本号
        createdAt: toString(meta?.createdAt, nowIso()),
        updatedAt: toString(meta?.updatedAt, nowIso()),
        generator: typeof meta?.generator === 'string' ? meta.generator : undefined,
        units: meta?.units === 'centimeter' || meta?.units === 'millimeter' || meta?.units === 'meter' ? meta.units : undefined,
        upAxis: meta?.upAxis === 'z' || meta?.upAxis === 'y' ? meta.upAxis : undefined,
      },
      // 将 sceneSettings 各字段展平到文档顶层（v2 结构）
      basic: { ...sceneSettings.basic },
      environment: { ...sceneSettings.environment, fog: { ...sceneSettings.environment.fog }, hdri: { ...sceneSettings.environment.hdri } },
      camera: { ...sceneSettings.camera, position: { ...sceneSettings.camera.position }, target: { ...sceneSettings.camera.target } },
      grid: { ...sceneSettings.grid },
      helpers: { axes: { ...sceneSettings.helpers.axes } },
      renderer: { ...sceneSettings.renderer },
      sceneTree: sceneSettings.sceneTree ?? [],
      // v1 格式没有 content（objectSnapshot 机制），content 清空由导入链从 sceneSnapshot/nodes 恢复
      content: [],
      // 保留原始 sceneSettings，供后续 normalizeVizonDocument 还能访问完整设置
      sceneSettings,
      // v1 的 sceneSnapshot（Three.js JSON 场景快照）保留，导入时作为备用恢复路径
      sceneSnapshot: isRecord(input.sceneSnapshot) ? (input.sceneSnapshot as any) : undefined,
      // v1 的节点列表保留，供 nodes 路径导入
      nodes: Array.isArray(input.nodes) ? (input.nodes as any) : [],
      assets: isRecord(input.assets) ? (input.assets as any) : undefined,
    };
  }

  // 未知版本号：直接抛错，避免用损坏/不兼容的数据静默导入到编辑器
  throw new Error(`Unsupported VizonDocument schemaVersion: ${String(schemaVersion)}`);
}

/**
 * 在迁移后的 v2 形状基础上，对所有字段做规范化：填充缺失默认值、去除非法字段。
 * 内部函数，外部通过 `parseVizonDocument` 调用，不单独使用。
 */
export function normalizeVizonDocument(doc: VizonDocument): VizonDocument {
  // normalizeSceneSettings 负责用默认值填补缺失字段，保证每个设置字段都有合法值
  const sceneSettings = normalizeSceneSettings({
    basic: doc.basic,
    environment: doc.environment,
    camera: doc.camera,
    grid: doc.grid,
    helpers: doc.helpers,
    renderer: doc.renderer,
    // sceneTree 必须是数组，migrate 阶段已保证，此处再做一次保护
    sceneTree: Array.isArray(doc.sceneTree) ? doc.sceneTree : [],
  } as SceneSettings);

  // content 是场景节点内容树，保持原始形状（由 importParsedDocument 消费）
  const normalizedContent = Array.isArray(doc.content) ? doc.content : [];
  // nodes 是旧版（v1）节点列表，可选；有则逐个规范化字段
  const nodesRaw = doc.nodes;
  const nodes = Array.isArray(nodesRaw) ? nodesRaw.map((n) => normalizeNode(n)) : undefined;

  return {
    // 展开原文档的所有字段（包含 assets 等透传字段）
    ...doc,
    // 以下字段用规范化后的值覆盖，确保每个字段都有合法的默认值
    basic: { ...sceneSettings.basic },
    environment: { ...sceneSettings.environment, fog: { ...sceneSettings.environment.fog }, hdri: { ...sceneSettings.environment.hdri } },
    camera: { ...sceneSettings.camera, position: { ...sceneSettings.camera.position }, target: { ...sceneSettings.camera.target } },
    grid: { ...sceneSettings.grid },
    helpers: { axes: { ...sceneSettings.helpers.axes } },
    renderer: { ...sceneSettings.renderer },
    // sceneTree 由 normalizeSceneSettings 统一规范（会去除无效节点等）
    sceneTree: sceneSettings.sceneTree,
    // content 保持原始结构，不做额外规范化（字段验证交给导入执行层）
    content: normalizedContent as VizonContentNode[],
    // 注入完整规范化后的 sceneSettings（供 importParsedDocument 的场景设置应用路径使用）
    sceneSettings,
    // 规范化后的 nodes 列表
    nodes,
    // sceneSnapshot 只接受对象类型，非对象时剔除
    sceneSnapshot: isRecord(doc.sceneSnapshot) ? doc.sceneSnapshot : undefined,
  };
}

/**
 * 将单个原始节点（来自外部 JSON 的 nodes 数组）规范化为合法的 `VizonNode`。
 *
 * 规则：
 * - `id` 是必填字段，缺失时直接抛错（调用方捕获后可跳过该节点）
 * - 其他字段用 `to*` 工具函数赋予安全的默认值，不抛错
 * - `layers` 做合法范围过滤（0-31 整数），无效值直接丢弃
 */
export function normalizeNode(input: unknown): VizonNode {
  // 非对象类型的 input 无法继续解析，直接抛错
  if (!isRecord(input)) throw new Error('Invalid node: not an object');
  // id 是节点唯一标识，必须是非空字符串
  const id = toString(input.id, '');
  if (!id) throw new Error('Invalid node.id');

  // 向量和四元数的默认值（对应 Three.js 初始状态：原点、单位方向、无缩放）
  const fallbackVec3: VizonVec3 = { x: 0, y: 0, z: 0 };
  const fallbackScale: VizonVec3 = { x: 1, y: 1, z: 1 };  // 缩放默认为 (1,1,1)
  const fallbackQuat: VizonQuat = { x: 0, y: 0, z: 0, w: 1 };  // 单位四元数

  // 子节点 id 列表：确保每项都是非空字符串，其余过滤掉
  const children = Array.isArray(input.children) ? input.children.map((c) => toString(c, '')).filter(Boolean) : [];
  // layer 值必须是 0-31 范围内的整数（Three.js 共 32 层），无效值丢弃
  const layers = Array.isArray(input.layers)
    ? input.layers.map((l) => toFiniteNumber(l, -1)).filter((n) => Number.isInteger(n) && n >= 0 && n < 32)
    : [0];  // 缺失时默认只在第 0 层（默认可见层）

  const node: VizonNode = {
    id,
    // name 缺失时返回空字符串（在编辑器中会显示为对象 type 名）
    name: toString(input.name, ''),
    // type 缺失时降级为 Object3D（通用 Three.js 节点类型）
    type: toString(input.type, 'Object3D'),
    // parentId 为 null 表示根节点；显式传 null 保留；缺失时也视为 null
    parentId: input.parentId == null ? null : toString(input.parentId, null as any),
    children,
    // visible 默认 true（节点默认可见）
    visible: toBool(input.visible, true),
    layers,
    // 变换属性用安全默认值（原点/单位方向/无缩放）
    position: toVec3(input.position, fallbackVec3),
    quaternion: toQuat(input.quaternion, fallbackQuat),
    scale: toVec3(input.scale, fallbackScale),
  };

  // flags 是可选的行为标记（hideInEditor、nonSelectable 等），仅字段存在时才写入
  if (isRecord(input.flags)) {
    node.flags = {
      // null 表示未设置（继承默认），undefined 时不写入
      hideInEditor: input.flags.hideInEditor == null ? undefined : toBool(input.flags.hideInEditor, false),
      nonSelectable: input.flags.nonSelectable == null ? undefined : toBool(input.flags.nonSelectable, false),
      nonPickable: input.flags.nonPickable == null ? undefined : toBool(input.flags.nonPickable, false),
      // dynamic 标记该节点在运行时可能被代码修改（影响编辑器优化策略）
      dynamic: input.flags.dynamic == null ? undefined : toBool(input.flags.dynamic, false),
    };
  }

  // components 是可选的组件数据（effects、light、camera 等），保持原样透传
  if (isRecord(input.components)) {
    node.components = input.components as any;
  }

  return node;
}
