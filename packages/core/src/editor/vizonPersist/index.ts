/**
 * **Vizon 文档持久化模块**（`editor/vizonPersist/`）
 *
 * 负责 **VizonDocument** 与运行时 **Three.js 场景** 之间的双向桥梁：
 * - **导出**：从 `ThreeEditor`（或满足 `VizonDocumentBuildEditorLike` 的对象）组装 JSON 文档（`buildVizonDocumentFromEditor`）。
 * - **导入**：`parseVizonDocument` / `migrateVizonDocument` 校验与版本迁移 → `importDocument` 清空后重建场景节点 → `importParsedDocument` 应用内容树。
 *
 * **同目录文件分工**：
 * | 文件 | 职责 |
 * |------|------|
 * | `vizonPersistConstants.ts` | schema 版本号、导入错误码、运行时 helper 类型集合 |
 * | `vizonPersistShared.ts` | 解析用的窄类型守卫与 `toVec3`/`toQuat` 等 |
 * | `vizonPersistParse.ts` | 外源 JSON → 规范化 `VizonDocument`、节点 normalize |
 * | `vizonPersistScene.ts` | 场景图序列化（`serializeVizonSceneContent`）与导入时 helper/layer/材质等应用 |
 * | `vizonPersistBuild.ts` | 从 editor 快照构建文档（避免与 `ThreeEditor` 循环依赖的接口） |
 * | `vizonPersistImport.ts` | `importParsedDocument`：把已解析文档写入 `ThreeEditor` |
 *
 * 对外仍通过 `vizon-3d-core` 根 `index.ts` 再导出；应用层优先 `import { importDocument, parseVizonDocument } from 'vizon-3d-core'`。
 */
import type { ThreeEditor } from '../ThreeEditor';
import { importParsedDocument } from './vizonPersistImport';  // 把已解析的文档写入场景
import { parseVizonDocument } from './vizonPersistParse';     // 负责版本迁移与字段规范化

// ——— 对外导出 ———

// 从编辑器状态构建持久化文档（导出侧入口）
export { buildVizonDocumentFromEditor } from './vizonPersistBuild';
// 构建文档所需的最小编辑器接口（供类型声明使用，避免暴露 ThreeEditor 全量接口）
export type { VizonDocumentBuildEditorLike } from './vizonPersistBuild';
// 版本迁移 + 规范化两个阶段分别导出，便于测试或外部仅需迁移时按需调用
export { migrateVizonDocument, parseVizonDocument } from './vizonPersistParse';
// 供上层（如 apps/web）做 i18n 映射的错误标识常量
export { VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT } from './vizonPersistConstants';
// 场景图序列化，供 buildVizonDocumentFromEditor 调用
export { serializeVizonSceneContent } from './vizonPersistScene';

/**
 * 把任意 JSON 快照恢复到编辑器内部（清空后重建）。
 *
 * 流程：
 * 1. `parseVizonDocument`：将外部 unknown 输入规范化为合法 VizonDocument
 * 2. `editor.clearSceneNodes()`：清空编辑器中的所有用户节点，为导入腾出干净状态
 * 3. `importParsedDocument`：将规范化后的文档内容写入 Three.js 场景
 *
 * @param options.resetSceneSettings  默认 true，将文档中的场景设置（环境/相机/网格等）应用到编辑器；
 *                                    传 false 时只恢复场景节点，不影响当前设置。
 */
export async function importDocument(
  editor: ThreeEditor,
  input: unknown,
  options?: { resetSceneSettings?: boolean }
): Promise<void> {
  // 第一步：校验、迁移、规范化——将任意外部 JSON 转换为内部一致格式
  const doc = parseVizonDocument(input);
  // 第二步：清空编辑器中的所有用户节点，确保导入是从空场景开始的
  await editor.clearSceneNodes();
  // 第三步：将规范化后的文档内容（节点树、场景设置等）写回编辑器
  await importParsedDocument(editor, doc, options);
}
