/** `runSceneSettingsHistoryCommit`。 */
import { describe, expect, it, vi } from 'vitest';

import type { SceneSettings } from '../../../settings/sceneSettings';
import { createDefaultSceneSettings } from '../../../settings/sceneSettings';
import { createSingleSlotPending, seedSingleSlotBaselineIfEmpty } from '../singleSlotPending';
import { runSceneSettingsHistoryCommit } from '../sceneSettingsHistory';

describe('runSceneSettingsHistoryCommit', () => {
  it('recordHistory false 时返回 false', async () => {
    const r = await runSceneSettingsHistoryCommit({
      pending: createSingleSlotPending(),
      next: createDefaultSceneSettings(),
      options: { recordHistory: false },
      normalizeSceneSettings: (s) => s,
      getLiveSceneSettings: () => createDefaultSceneSettings(),
      isEqualForHistory: () => false,
      buildDefaultOperationName: () => 'n',
      applyWithoutHistory: vi.fn(),
      executeHistoryOperation: vi.fn()
    });
    expect(r).toBe(false);
  });

  it('normalize 后与基线相等则短路', async () => {
    const live = createDefaultSceneSettings();
    const exec = vi.fn();
    const r = await runSceneSettingsHistoryCommit({
      pending: createSingleSlotPending(),
      next: live,
      options: {},
      normalizeSceneSettings: (s) => s,
      getLiveSceneSettings: () => live,
      isEqualForHistory: (a, b) => a.version === b.version && a.basic.sceneName === b.basic.sceneName,
      buildDefaultOperationName: () => 'n',
      applyWithoutHistory: vi.fn(),
      executeHistoryOperation: exec
    });
    expect(r).toBe(true);
    expect(exec).not.toHaveBeenCalled();
  });

  it('不相等时调用 execute 且带 mergeKey', async () => {
    const exec = vi.fn(async () => {});
    const live = createDefaultSceneSettings();
    const next = { ...live, basic: { ...live.basic, sceneName: 'Renamed' } };
    await runSceneSettingsHistoryCommit({
      pending: createSingleSlotPending(),
      next,
      options: {},
      normalizeSceneSettings: (s) => s,
      getLiveSceneSettings: () => live,
      isEqualForHistory: () => false,
      buildDefaultOperationName: () => 'hist',
      applyWithoutHistory: vi.fn(),
      executeHistoryOperation: exec
    });
    expect(exec).toHaveBeenCalledOnce();
    expect(exec.mock.calls[0][0].mergeKey).toBe('scene-settings');
  });

  it('pending 基线在 undo 时写回', async () => {
    const live = createDefaultSceneSettings();
    const pending = createSingleSlotPending<SceneSettings>();
    seedSingleSlotBaselineIfEmpty(pending, live);
    const next = { ...live, basic: { ...live.basic, sceneName: 'After' } };
    const names: string[] = [];
    await runSceneSettingsHistoryCommit({
      pending,
      next,
      options: {},
      normalizeSceneSettings: (s) => s,
      getLiveSceneSettings: () => ({ ...live, basic: { ...live.basic } }),
      isEqualForHistory: () => false,
      buildDefaultOperationName: () => 'n',
      applyWithoutHistory: async (s) => {
        names.push(s.basic.sceneName);
      },
      executeHistoryOperation: async (op) => {
        await op.do?.();
        await op.undo?.();
      }
    });
    expect(names).toEqual(['After', live.basic.sceneName]);
  });
});
