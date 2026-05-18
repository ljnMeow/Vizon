/**
 * **从编辑器快照构建 VizonDocument**（导出侧）。
 *
 * 通过 `VizonDocumentBuildEditorLike` 只依赖 `scene` + `getSceneSettings()`，
 * 避免 `ThreeEditor` ↔ 本模块循环 import。
 * 场景节点内容由 `serializeVizonSceneContent` 生成，与设置字段共用单一数据源。
 */
import * as THREE from 'three';
import type { SceneSettings } from '../../settings/sceneSettings';
import type { VizonContentNode, VizonDocument } from '../../types/document';
import { LATEST_SCHEMA_VERSION } from './vizonPersistConstants';
import { isRecord, nowIso } from './vizonPersistShared';
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
 * 递归移除 content 节点树中所有 objectSnapshot 里的纹理相关数据。
 *
 * Three.js 的 Object3D.toJSON() 会将所有引用的纹理图片以 base64 data URI 形式
 * 写入 objectSnapshot.images 数组，每个图片可达数 MB。这些数据在项目包中是冗余的，
 * 因为项目包 ZIP 已将纹理文件作为独立二进制文件存储于 assets/textures/<id>.<ext>，
 * 且导入时 importProjectBundle 会从 ZIP 中重新加载纹理并覆盖到材质槽位。
 *
 * 同时移除 images 和 textures 数组：仅删除 images 而保留 textures 会导致
 * ObjectLoader.parseTextures() 通过 UUID 查找 image 时崩溃
 *（Cannot read properties of undefined (reading 'data')）。
 * 导入时 importProjectBundle 会从 ZIP 重新加载纹理并挂回材质槽位，
 * 因此 textures 数组中的参数元数据（repeat/offset/wrap）也不需要保留。
 *
 * 保留 geometries/materials/object 等字段不变。
 *
 * 注意：如果未来引入 DataTexture（无外部文件对应的程序化纹理），需要在此处
 * 增加保留逻辑，避免将无文件备份的纹理图片误删。
 */
function stripImagesFromContentNodes(nodes: VizonContentNode[]): void {
  for (const node of nodes) {
    const snapshot = node.attribute?.objectSnapshot;
    if (isRecord(snapshot)) {
      if ('images' in snapshot) {
        delete (snapshot as Record<string, unknown>).images;
      }
      if ('textures' in snapshot) {
        delete (snapshot as Record<string, unknown>).textures;
      }
    }
    if (node.children?.length) {
      stripImagesFromContentNodes(node.children);
    }
  }
}

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
  // 移除 objectSnapshot 中冗余的 base64 纹理图片数据
  // （项目包已将纹理作为独立文件存储，导入时从 ZIP 恢复）
  stripImagesFromContentNodes(content);
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
