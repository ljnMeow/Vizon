/**
 * **从编辑器快照构建 VizonDocument**（导出侧）。
 *
 * 通过 `VizonDocumentBuildEditorLike` 只依赖 `scene` + `getSceneSettings()`，
 * 避免 `ThreeEditor` ↔ 本模块循环 import。
 * 场景节点内容由 `serializeVizonSceneContent` 生成，与设置字段共用单一数据源。
 */
import * as THREE from 'three';
import type { SceneSettings } from '../../settings/sceneSettings';
import type { VizonDocument } from '../../types/document';
import { LATEST_SCHEMA_VERSION } from './vizonPersistConstants';
import { nowIso } from './vizonPersistShared';
import { serializeVizonSceneContent } from './vizonPersistScene';

/**
 * 构建持久化文档所需的最小编辑器能力接口。
 *
 * 只声明两个方法，而不直接依赖 ThreeEditor 的完整类型，
 * 可以避免 `vizonPersistBuild` ↔ `ThreeEditor` 之间的循环 import，
 * 同时也让测试可以用轻量 mock 而无需构造整个编辑器实例。
 */
export interface VizonDocumentBuildEditorLike {
  /** Three.js 场景对象，用于遍历场景图并序列化节点 */
  readonly scene: THREE.Scene;
  /** 返回当前场景设置快照（basic/environment/camera/grid/helpers/renderer/sceneTree） */
  getSceneSettings(): SceneSettings;
}

/**
 * 从编辑器当前状态快照构建一个完整的 `VizonDocument`。
 *
 * 调用顺序：
 * 1. 读取场景设置（sceneSettings）
 * 2. 序列化场景节点树（content）
 * 3. 组装 meta + 各设置字段 + content，返回完整文档
 *
 * @param options.generator  可选，写入 meta.generator 字段，标识是哪个模块生成的文档
 *                           （例如 `'apps/web-save-scene'`），便于调试时追溯来源。
 */
export function buildVizonDocumentFromEditor(
  editor: VizonDocumentBuildEditorLike,
  options?: { generator?: string }
): VizonDocument {
  // 读取编辑器当前的场景设置快照（包含环境、相机、网格、renderer 等所有设置）
  const sceneSettings = editor.getSceneSettings();
  // 生成一个一致的时间戳，createdAt 与 updatedAt 在新建时相同
  const ts = nowIso();
  // 遍历场景图，将每个顶层用户节点序列化为 VizonContentNode 树
  // 仅顶层节点包含 objectSnapshot（Three.js 完整 JSON），子节点只含变换等轻量数据
  const content = serializeVizonSceneContent(editor.scene);
  return {
    meta: {
      // 写入当前最高 schema 版本号，导入时以此判断是否需要迁移
      schemaVersion: LATEST_SCHEMA_VERSION,
      // 创建时间和最后修改时间在首次构建时取同一时刻
      createdAt: ts,
      updatedAt: ts,
      // 可选的来源标识，undefined 时不写入 JSON
      generator: options?.generator,
      // 坐标系约定：Y 轴朝上
      upAxis: 'y',
      // 单位约定：米
      units: 'meter',
    },
    // 展开复制基础场景信息（sceneName、description 等），避免引用同一对象
    basic: { ...sceneSettings.basic },
    environment: {
      // 先展开顶层环境字段
      ...sceneSettings.environment,
      // 嵌套对象单独展开，防止修改文档时意外影响编辑器内部状态
      fog: { ...sceneSettings.environment.fog },
      hdri: { ...sceneSettings.environment.hdri },
    },
    camera: {
      ...sceneSettings.camera,
      // 位置与目标点单独展开，避免与场景内 Three.js Vector3 对象共享引用
      position: { ...sceneSettings.camera.position },
      target: { ...sceneSettings.camera.target },
    },
    // 网格设置（颜色、透明度、是否显示）
    grid: { ...sceneSettings.grid },
    helpers: {
      // 仅包含坐标轴 helper 设置
      axes: { ...sceneSettings.helpers.axes },
    },
    // 渲染器参数（toneMapping、antialias、shadowMap 等）
    renderer: { ...sceneSettings.renderer },
    // 场景树节点列表（面板中展示的层级结构，每项浅复制避免引用共享）
    sceneTree: sceneSettings.sceneTree.map((node) => ({ ...node })),
    // 序列化后的场景节点内容树（含 objectSnapshot）
    content,
    // assets 字段由上层（如 apps/web 的 documentBundle）在导出时注入贴图清单
    assets: {},
  };
}
