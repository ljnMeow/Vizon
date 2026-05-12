import type { ThreeEditor } from './ThreeEditor';
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
