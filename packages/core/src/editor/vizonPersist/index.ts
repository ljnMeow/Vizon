/**
 * **Vizon 文档持久化模块**（`editor/vizonPersist/`）
 *
 * 负责 **VizonDocument** 与运行时 **Three.js 场景** 之间的双向桥梁：
 * - **导出**：从 `ThreeEditor`（或满足 `VizonDocumentBuildEditorLike` 的对象）组装 JSON 文档（`buildVizonDocumentFromEditor`）。
 * - **导入**：`parseVizonDocument` / `migrateVizonDocument` 校验与版本迁移 → `importDocument` 清空并重建场景节点 → `importParsedDocument` 应用内容树。
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
import { importParsedDocument } from './vizonPersistImport';
import { parseVizonDocument } from './vizonPersistParse';

export { buildVizonDocumentFromEditor } from './vizonPersistBuild';
export type { VizonDocumentBuildEditorLike } from './vizonPersistBuild';
export { migrateVizonDocument, parseVizonDocument } from './vizonPersistParse';
export { VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT } from './vizonPersistConstants';
export { serializeVizonSceneContent } from './vizonPersistScene';

/** 把 JSON 快照恢复到编辑器内部（清空后重建）；与 SceneSettings 仅通过 parse 后的文档字段对齐一套结构 */
export async function importDocument(
  editor: ThreeEditor,
  input: unknown,
  options?: { resetSceneSettings?: boolean }
): Promise<void> {
  const doc = parseVizonDocument(input);
  await editor.clearSceneNodes();
  await importParsedDocument(editor, doc, options);
}
