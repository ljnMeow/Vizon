/** `runRendererSettingsHistoryCommit`。 */
import { describe, expect, it, vi } from 'vitest';

import type { RendererSettings } from '../../../settings/sceneSettings';
import { createSingleSlotPending, seedSingleSlotBaselineIfEmpty } from '../singleSlotPending';
import { runRendererSettingsHistoryCommit } from '../rendererSettingsHistory';

const baseRenderer = (): RendererSettings =>
  ({
    antialias: true,
    outputColorSpace: 'srgb',
    toneMapping: 'aces',
    toneMappingExposure: 1,
    shadowMapEnabled: true,
    shadowMapType: 'pcf',
    shadowMapAutoUpdate: true
  }) as RendererSettings;

describe('runRendererSettingsHistoryCommit', () => {
  it('recordHistory false 时返回 false', () => {
    const exec = vi.fn();
    const r = runRendererSettingsHistoryCommit({
      pending: createSingleSlotPending(),
      next: baseRenderer(),
      options: { recordHistory: false },
      getLiveRendererSettings: baseRenderer,
      isEqual: () => false,
      buildDefaultOperationName: () => 'n',
      applyWithoutHistory: vi.fn(),
      executeHistoryOperation: exec
    });
    expect(r).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it('与当前相等时短路并入栈', () => {
    const exec = vi.fn();
    const live = baseRenderer();
    const r = runRendererSettingsHistoryCommit({
      pending: createSingleSlotPending(),
      next: { ...live },
      options: {},
      getLiveRendererSettings: () => ({ ...live }),
      isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      buildDefaultOperationName: () => 'n',
      applyWithoutHistory: vi.fn(),
      executeHistoryOperation: exec
    });
    expect(r).toBe(true);
    expect(exec).not.toHaveBeenCalled();
  });

  it('不相等时提交历史并带 mergeKey', () => {
    let captured: any;
    const next = { ...baseRenderer(), toneMappingExposure: 2 } as RendererSettings;
    runRendererSettingsHistoryCommit({
      pending: createSingleSlotPending(),
      next,
      options: {},
      getLiveRendererSettings: baseRenderer,
      isEqual: (a, b) => a.toneMappingExposure === b.toneMappingExposure,
      buildDefaultOperationName: () => 'default-name',
      applyWithoutHistory: vi.fn(),
      executeHistoryOperation: (op) => {
        captured = op;
      }
    });
    expect(captured.mergeKey).toBe('renderer-settings');
    expect(captured.name).toBe('default-name');
  });

  it('pending 基线用于 undo', () => {
    const apply = vi.fn();
    const pending = createSingleSlotPending<RendererSettings>();
    seedSingleSlotBaselineIfEmpty(pending, { ...baseRenderer(), toneMappingExposure: 0.5 } as RendererSettings);
    const next = { ...baseRenderer(), toneMappingExposure: 2 } as RendererSettings;
    runRendererSettingsHistoryCommit({
      pending,
      next,
      options: {},
      getLiveRendererSettings: baseRenderer,
      isEqual: () => false,
      buildDefaultOperationName: () => 'n',
      applyWithoutHistory: apply,
      executeHistoryOperation: (op) => {
        op.do?.();
        op.undo?.();
      }
    });
    expect(apply.mock.calls[0][0].toneMappingExposure).toBe(2);
    expect(apply.mock.calls[1][0].toneMappingExposure).toBe(0.5);
  });
});
