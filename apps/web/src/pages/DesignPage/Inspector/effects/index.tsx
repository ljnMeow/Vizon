import { useCallback, useEffect, useState } from 'react';

import { ColorPicker } from '../../../../components/ColorPicker';
import { useLocale } from '../../../../hooks/useLocale';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { appMessages } from '../../../../i18n/messages';
import { encodeHistoryI18nName } from '../../../../utils/historyI18n';
import { VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS } from '../../../../utils/keys';

// 写入 mesh.userData 的键名，渲染侧通过同一 key 读取特效配置
/** 存储在 mesh.userData 上的特效配置键名 */
const EFFECTS_USERDATA_KEY = VIZON_STORAGE_KEYS.EFFECTS;

// 描边 + 辉光两套特效的状态定义
type EffectsState = {
  borderEnabled: boolean;
  borderWidth: number; // 描边宽度 1 ~ 20
  borderColor: string; // #rrggbb
  glowEnabled: boolean;
  glowColor: string; // #rrggbb
  glowRange: number; // 辉光扩散范围 0 ~ 60
  glowBrightness: number; // 辉光亮度 0 ~ 2
};

const DEFAULT_EFFECTS: EffectsState = {
  borderEnabled: false,
  borderWidth: 1,
  borderColor: '#ff0000',
  glowEnabled: false,
  glowColor: '#66ccff',
  glowRange: 30,
  glowBrightness: 1
};

// 将数值限制在 [min, max] 区间内
function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// 校验并规范化十六进制颜色，非法值回退到默认红色
function sanitizeHexColor(hex: unknown) {
  if (typeof hex !== 'string') return DEFAULT_EFFECTS.borderColor;
  const v = hex.trim();
  // `input[type="color"]` requires a valid `#rrggbb`-like format.
  if (!/^#([0-9a-fA-F]{6})$/.test(v)) return DEFAULT_EFFECTS.borderColor;
  return v;
}

// 将任意原始数据安全地转换为合法的 EffectsState，缺失字段回退默认值，数值做 clamp
function normalizeEffectsState(raw: any): EffectsState {
  const borderEnabled = Boolean(raw?.borderEnabled ?? DEFAULT_EFFECTS.borderEnabled);
  const borderWidthRaw = raw?.borderWidth;
  const borderWidth = typeof borderWidthRaw === 'number' && Number.isFinite(borderWidthRaw) ? borderWidthRaw : DEFAULT_EFFECTS.borderWidth;

  const borderColor = sanitizeHexColor(raw?.borderColor ?? DEFAULT_EFFECTS.borderColor);

  const glowEnabled = Boolean(raw?.glowEnabled ?? DEFAULT_EFFECTS.glowEnabled);
  const glowColor = sanitizeHexColor(raw?.glowColor ?? DEFAULT_EFFECTS.glowColor);
  const glowRangeRaw = raw?.glowRange;
  const glowRange = typeof glowRangeRaw === 'number' && Number.isFinite(glowRangeRaw) ? glowRangeRaw : DEFAULT_EFFECTS.glowRange;
  const glowBrightnessRaw = raw?.glowBrightness;
  const glowBrightness =
    typeof glowBrightnessRaw === 'number' && Number.isFinite(glowBrightnessRaw) ? glowBrightnessRaw : DEFAULT_EFFECTS.glowBrightness;

  return {
    borderEnabled,
    borderWidth: clamp(borderWidth, 0, 20),
    borderColor,
    glowEnabled,
    glowColor,
    glowRange: clamp(glowRange, 0, 60),
    glowBrightness: clamp(glowBrightness, 0, 2)
  };
}

// 判断对象是否为可配置特效的 Mesh（排除标记为不可选/隐藏的对象）
function isConfigurableMesh(obj: any): boolean {
  if (!obj?.isMesh) return false;
  if (obj?.userData?.[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE]) return false;
  if (obj?.userData?.[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR]) return false;
  return true;
}

function getFirstMesh(root: any): any | null {
  if (!root?.traverse) return null;
  let first: any | null = null;
  root.traverse((child: any) => {
    if (first) return;
    if (isConfigurableMesh(child)) first = child;
  });
  return first;
}

function readEffectsFromMesh(mesh: any): EffectsState {
  const raw = mesh?.userData?.[EFFECTS_USERDATA_KEY];
  return normalizeEffectsState(raw);
}

function forEachMesh(root: any, fn: (mesh: any) => void) {
  if (!root?.traverse) return;
  root.traverse((child: any) => {
    if (!isConfigurableMesh(child)) return;
    fn(child);
  });
}

/**
 * 特效设置面板。
 * 当前支持描边与辉光两套效果，并将配置写入 mesh.userData，供渲染侧读取。
 */
export function EffectsSettings() {
  const { editor } = useSceneSettings();
  const { locale } = useLocale();
  const t = appMessages[locale].designPage.inspector.effectsSettings;
  const effectsZh = appMessages['zh-CN'].designPage.inspector.effectsSettings;
  const effectsEn = appMessages['en-US'].designPage.inspector.effectsSettings;
  const historyName = (key: keyof typeof effectsZh.history) =>
    encodeHistoryI18nName({
      'zh-CN': effectsZh.history[key],
      'en-US': effectsEn.history[key]
    });

  const [effects, setEffects] = useState<EffectsState>(DEFAULT_EFFECTS);
  const [hasMeshSelection, setHasMeshSelection] = useState(false);

  /**
   * 从当前选中对象同步特效状态。
   * 若选中的是组合节点，则读取其第一 个可配置 Mesh 的效果参数作为面板展示值。
   */
  const syncFromSelection = useCallback(() => {
    if (!editor) {
      setEffects(DEFAULT_EFFECTS);
      setHasMeshSelection(false);
      return;
    }

    const root = editor.getSelected();
    if (!root) {
      setEffects(DEFAULT_EFFECTS);
      setHasMeshSelection(false);
      return;
    }

    const mesh = getFirstMesh(root);
    const next = mesh ? readEffectsFromMesh(mesh) : DEFAULT_EFFECTS;
    setHasMeshSelection(Boolean(mesh));
    setEffects(next);
  }, [editor]);

  useEffect(() => {
    syncFromSelection();
    if (!editor) return;

    const off = editor.on('select', () => {
      syncFromSelection();
    });
    return off;
  }, [editor, syncFromSelection]);

  /**
   * 将局部特效变更批量应用到当前选中对象下的所有可配置 Mesh。
   * 支持通过 historyOperation 记录撤销/重做。
   */
  const applyPatchToSelection = useCallback(
    (patch: Partial<EffectsState>, operationName: string, options?: { recordHistory?: boolean }) => {
      if (!editor) return;
      const root = editor.getSelected();
      if (!root) return;

      const operations: Array<{ mesh: any; prev: EffectsState; next: EffectsState }> = [];
      forEachMesh(root, (mesh) => {
        const prev = readEffectsFromMesh(mesh);
        const next = normalizeEffectsState({ ...prev, ...patch });
        operations.push({ mesh, prev, next });
      });

      if (operations.length === 0) return;
      const applyToMesh = (mesh: any, state: EffectsState) => {
        mesh.userData ??= {};
        mesh.userData[EFFECTS_USERDATA_KEY] = state;
        const mat = mesh.material as any;
        if (Array.isArray(mat)) {
          for (const m of mat) if (m) (m as any).needsUpdate = true;
        } else if (mat) {
          (mat as any).needsUpdate = true;
        }
      };

      const recordHistory = options?.recordHistory ?? true;
      if (!recordHistory) {
        for (const item of operations) applyToMesh(item.mesh, item.next);
        setEffects((prev) => normalizeEffectsState({ ...prev, ...patch }));
        editor.render();
        return;
      }

      void editor.executeHistoryOperation({
        name: operationName,
        mergeKey: `effects:${root.uuid}:${operationName}`,
        mergeWindowMs: 280,
        do: () => {
          for (const item of operations) applyToMesh(item.mesh, item.next);
          setEffects((prev) => normalizeEffectsState({ ...prev, ...patch }));
          editor.render();
        },
        undo: () => {
          for (const item of operations) applyToMesh(item.mesh, item.prev);
          setEffects((prev) =>
            normalizeEffectsState({
              ...prev,
              ...Object.fromEntries(Object.keys(patch).map((k) => [k, (operations[0].prev as any)[k]]))
            })
          );
          editor.render();
        }
      });
    },
    [editor]
  );

  const onBorderEnabledChange = (checked: boolean) =>
    applyPatchToSelection(
      checked
        ? {
            borderEnabled: true,
            borderWidth: effects.borderWidth,
            borderColor: effects.borderColor
          }
        : { borderEnabled: false },
      historyName('borderEnabled')
    );
  const onBorderWidthPreviewChange = (next: number) =>
    applyPatchToSelection({ borderWidth: clamp(next, 1, 20) }, historyName('borderWidth'), { recordHistory: false });
  const onBorderWidthCommit = (next: number) =>
    applyPatchToSelection({ borderWidth: clamp(next, 1, 20) }, historyName('borderWidth'), { recordHistory: true });
  const onBorderColorChange = (hex: string) => applyPatchToSelection({ borderColor: hex }, historyName('borderColor'));

  const onGlowEnabledChange = (checked: boolean) =>
    applyPatchToSelection(
      checked
        ? {
            glowEnabled: true,
            glowColor: effects.glowColor,
            glowRange: effects.glowRange,
            glowBrightness: effects.glowBrightness
          }
        : { glowEnabled: false },
      historyName('glowEnabled')
    );
  const onGlowColorChange = (hex: string) => applyPatchToSelection({ glowColor: hex }, historyName('glowColor'));
  const onGlowRangePreviewChange = (next: number) =>
    applyPatchToSelection({ glowRange: next }, historyName('glowRange'), { recordHistory: false });
  const onGlowRangeCommit = (next: number) =>
    applyPatchToSelection({ glowRange: next }, historyName('glowRange'), { recordHistory: true });
  const onGlowBrightnessPreviewChange = (next: number) =>
    applyPatchToSelection({ glowBrightness: next }, historyName('glowBrightness'), { recordHistory: false });
  const onGlowBrightnessCommit = (next: number) =>
    applyPatchToSelection({ glowBrightness: next }, historyName('glowBrightness'), { recordHistory: true });

  return (
    <div className="space-y-4">
      {!hasMeshSelection ? (
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
          {t.noMeshSelection}
        </div>
      ) : null}

      <section className="space-y-2 rounded-md border border-[var(--border-subtle)]/70 bg-[var(--bg-subtle)]/35 px-2 py-2">
        <h4 className="text-[11px] font-semibold tracking-wide text-[var(--text-primary)]">{t.borderTitle}</h4>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{t.enableLabel}</span>
          <input type="checkbox" checked={effects.borderEnabled} disabled={!hasMeshSelection} onChange={(e) => onBorderEnabledChange(e.target.checked)} className="h-4 w-4" />
        </label>

        {effects.borderEnabled ? (
          <>
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{t.borderWidthLabel}</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={effects.borderWidth}
                  disabled={!hasMeshSelection}
                  onChange={(e) => onBorderWidthPreviewChange(Number(e.target.value))}
                  onPointerUp={(e) => onBorderWidthCommit(Number((e.target as HTMLInputElement).value))}
                  onMouseUp={(e) => onBorderWidthCommit(Number((e.target as HTMLInputElement).value))}
                  onTouchEnd={(e) => onBorderWidthCommit(Number((e.target as HTMLInputElement).value))}
                  aria-label={t.borderWidthAriaLabel}
                  className="w-full"
                />
                <div className="w-12 text-right text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{effects.borderWidth.toFixed(0)}</div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{t.colorLabel}</label>
              <ColorPicker value={effects.borderColor} onChange={onBorderColorChange} ariaLabel={t.borderColorAriaLabel} showValue={true} disabled={!hasMeshSelection} />
            </div>
          </>
        ) : null}
      </section>

      <section className="space-y-2 rounded-md border border-[var(--border-subtle)]/70 bg-[var(--bg-subtle)]/35 px-2 py-2">
        <h4 className="text-[11px] font-semibold tracking-wide text-[var(--text-primary)]">{t.glowTitle}</h4>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{t.enableLabel}</span>
          <input type="checkbox" checked={effects.glowEnabled} disabled={!hasMeshSelection} onChange={(e) => onGlowEnabledChange(e.target.checked)} className="h-4 w-4" />
        </label>

        {effects.glowEnabled ? (
          <>
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{t.colorLabel}</label>
              <ColorPicker value={effects.glowColor} onChange={onGlowColorChange} ariaLabel={t.glowColorAriaLabel} showValue={true} disabled={!hasMeshSelection} />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{t.glowRangeLabel}</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={1}
                  value={effects.glowRange}
                  disabled={!hasMeshSelection}
                  onChange={(e) => onGlowRangePreviewChange(Number(e.target.value))}
                  onPointerUp={(e) => onGlowRangeCommit(Number((e.target as HTMLInputElement).value))}
                  onMouseUp={(e) => onGlowRangeCommit(Number((e.target as HTMLInputElement).value))}
                  onTouchEnd={(e) => onGlowRangeCommit(Number((e.target as HTMLInputElement).value))}
                  aria-label={t.glowRangeAriaLabel}
                  className="w-full"
                />
                <div className="w-12 text-right text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{effects.glowRange.toFixed(0)}</div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{t.glowBrightnessLabel}</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.01}
                  value={effects.glowBrightness}
                  disabled={!hasMeshSelection}
                  onChange={(e) => onGlowBrightnessPreviewChange(Number(e.target.value))}
                  onPointerUp={(e) => onGlowBrightnessCommit(Number((e.target as HTMLInputElement).value))}
                  onMouseUp={(e) => onGlowBrightnessCommit(Number((e.target as HTMLInputElement).value))}
                  onTouchEnd={(e) => onGlowBrightnessCommit(Number((e.target as HTMLInputElement).value))}
                  aria-label={t.glowBrightnessAriaLabel}
                  className="w-full"
                />
                <div className="w-12 text-right text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{effects.glowBrightness.toFixed(2)}</div>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
