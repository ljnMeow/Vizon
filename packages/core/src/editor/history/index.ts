/**
 * **编辑器历史子模块**（撤销 / 重做 / 合并）及 **可测的纯辅助**。
 *
 * - **真源**：`HistoryManager` 仍在 `../HistoryManager.ts`（双栈、mergeKey 防抖、最大条数）。
 * - **本目录**：`executeWithHistoryNotify`（执行后统一 `historyChange`）、对象属性 / 单槽 pending、
 *   渲染器与场景设置提交封装、历史 payload 编码与值克隆等，减轻 `ThreeEditor` 体积并便于单测。
 *
 * UI 一般只消费 `ThreeEditor` 的 `undo`/`redo`/`getHistoryRecords`；若扩展自定义命令，可组合本目录导出与 `HistoryManager.execute`。
 */
export type { EditorHistoryRecord, EditorHistoryOperation } from '../HistoryManager';
export { HistoryManager } from '../HistoryManager';
export { encodeHistoryPayload } from './encodeHistoryPayload';
export { executeWithHistoryNotify } from './executeWithHistoryNotify';
export { getObjectHistoryTargetKind } from './historyTargetKind';
export {
  cloneForHistory,
  formatHistoryValue,
  isHistoryValueEqual,
  readNestedPath,
  readNestedValueCloned
} from './historyValueUtils';
export { runObjectPropertyHistoryStep } from './objectPropertyHistory';
export type { RunObjectPropertyHistoryParams } from './objectPropertyHistory';
export { runRendererSettingsHistoryCommit } from './rendererSettingsHistory';
export type { RunRendererSettingsHistoryCommitParams } from './rendererSettingsHistory';
export { runSceneSettingsHistoryCommit } from './sceneSettingsHistory';
export type { RunSceneSettingsHistoryCommitParams } from './sceneSettingsHistory';
export { seedObjectPropertyPendingBaseline, takeObjectPropertyHistoryBaseline } from './objectPropertyPending';
export {
  createSingleSlotPending,
  seedSingleSlotBaselineIfEmpty,
  takeSingleSlotBaselineOrLive,
  type SingleSlotPending
} from './singleSlotPending';
