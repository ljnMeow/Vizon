/**
 * **渲染器设置的历史提交**：结合 `SingleSlotPending` 取预览基线，与 `next` 比较后入栈或短路。
 */
import type { RendererSettings } from '../../settings/sceneSettings';
import type { EditorHistoryOperation } from './HistoryManager';

import type { SingleSlotPending } from './singleSlotPending';
import { takeSingleSlotBaselineOrLive } from './singleSlotPending';

export type RunRendererSettingsHistoryCommitParams = {
  pending: SingleSlotPending<RendererSettings>;
  next: RendererSettings;
  options?: { recordHistory?: boolean; operationName?: string };
  /** 当前内存中的 renderer 设置快照（与 `getRendererSettings` 一致） */
  getLiveRendererSettings: () => RendererSettings;
  isEqual: (a: RendererSettings, b: RendererSettings) => boolean;
  buildDefaultOperationName: () => string;
  applyWithoutHistory: (settings: RendererSettings) => void;
  executeHistoryOperation: (operation: EditorHistoryOperation) => void | Promise<void>;
};

/**
 * 若 `recordHistory !== false`：取 pending / live 基线、相等则短路，否则入栈并返回 true（门面应停止走「直接 apply」）。
 * 若仅为预览链路的调用（recordHistory: false），此处返回 false，由门面先 seed 再执行 apply。
 */
export function runRendererSettingsHistoryCommit(params: RunRendererSettingsHistoryCommitParams): boolean {
  if (!(params.options?.recordHistory ?? true)) return false;

  const baseline = takeSingleSlotBaselineOrLive(params.pending, () => ({ ...params.getLiveRendererSettings() }));
  const prevRenderer = { ...baseline };
  if (params.isEqual(prevRenderer, params.next)) return true;

  const op: EditorHistoryOperation = {
    name: params.options?.operationName ?? params.buildDefaultOperationName(),
    mergeKey: 'renderer-settings',
    mergeWindowMs: 280,
    do: () => params.applyWithoutHistory(params.next),
    undo: () => params.applyWithoutHistory(prevRenderer)
  };
  void params.executeHistoryOperation(op);
  return true;
}
