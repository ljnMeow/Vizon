/**
 * **整份 SceneSettings 的历史提交**：normalize 后与基线 `isEqualForHistory` 比较，再 `executeHistoryOperation`。
 */
import type { SceneSettings } from '../../settings/sceneSettings';
import type { EditorHistoryOperation } from './HistoryManager';

import type { SingleSlotPending } from './singleSlotPending';
import { takeSingleSlotBaselineOrLive } from './singleSlotPending';

export type RunSceneSettingsHistoryCommitParams = {
  pending: SingleSlotPending<SceneSettings>;
  next: SceneSettings;
  options?: { recordHistory?: boolean; operationName?: string };
  normalizeSceneSettings: (s: SceneSettings) => SceneSettings;
  getLiveSceneSettings: () => SceneSettings;
  isEqualForHistory: (a: SceneSettings, b: SceneSettings) => boolean;
  buildDefaultOperationName: () => string;
  applyWithoutHistory: (settings: SceneSettings) => Promise<void>;
  executeHistoryOperation: (operation: EditorHistoryOperation) => Promise<void>;
};

/**
 * 场景设置带历史的提交：normalize 后与基线比较，相等则短路；否则 `executeHistoryOperation`。
 * 返回 true 表示已处理（含「相等 noop」），门面应跳过后续直接 apply。
 */
export async function runSceneSettingsHistoryCommit(params: RunSceneSettingsHistoryCommitParams): Promise<boolean> {
  if (!(params.options?.recordHistory ?? true)) return false;

  const prev = takeSingleSlotBaselineOrLive(params.pending, params.getLiveSceneSettings);
  const normalizedNext = params.normalizeSceneSettings(params.next);
  if (params.isEqualForHistory(prev, normalizedNext)) return true;

  await params.executeHistoryOperation({
    name: params.options?.operationName ?? params.buildDefaultOperationName(),
    mergeKey: 'scene-settings',
    mergeWindowMs: 280,
    do: () => params.applyWithoutHistory(normalizedNext),
    undo: () => params.applyWithoutHistory(prev)
  });
  return true;
}
