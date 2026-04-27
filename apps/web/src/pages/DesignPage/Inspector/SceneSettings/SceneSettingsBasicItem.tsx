import { useEffect, useState } from 'react';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { encodeHistoryI18nName } from '../../../../utils/historyI18n';

/** 场景基础设置项的 i18n 文案 */
export type SceneSettingsBasicLabels = {
  title: string;
  sceneNameLabel: string;
  sceneNamePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
};

/**
 * 场景基础信息设置项。
 * 输入框采用"即时更新、失焦提交历史"双通道策略，避免每次按键都产生历史记录。
 */
export function SceneSettingsBasicItem({ labels }: { labels: SceneSettingsBasicLabels }) {
  const { sceneSettings, updateSceneSettings } = useSceneSettings();
  const { sceneName, description } = sceneSettings.basic;
  const [draftSceneName, setDraftSceneName] = useState(sceneName);
  const [draftDescription, setDraftDescription] = useState(description);
  const historyName = (zhName: string, enName: string) =>
    encodeHistoryI18nName({ 'zh-CN': zhName, 'en-US': enName });

  useEffect(() => {
    setDraftSceneName(sceneName);
  }, [sceneName]);
  useEffect(() => {
    setDraftDescription(description);
  }, [description]);

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
          {labels.sceneNameLabel}
        </label>
        <input
          value={draftSceneName}
          onChange={(e) => {
            const v = e.target.value;
            setDraftSceneName(v);
            updateSceneSettings(
              (prev) => ({ ...prev, basic: { ...prev.basic, sceneName: v } }),
              { recordHistory: false }
            );
          }}
          onBlur={() => {
            const displayValue = draftSceneName || '""';
            updateSceneSettings(
              (prev) => ({ ...prev, basic: { ...prev.basic, sceneName: draftSceneName } }),
              {
                recordHistory: true,
                operationName: historyName(
                  `修改场景属性-基础设置-场景名称 = ${displayValue}`,
                  `Modify scene property - basic settings - scene name = ${displayValue}`
                )
              }
            );
          }}
          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          placeholder={labels.sceneNamePlaceholder}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
          {labels.descriptionLabel}
        </label>
        <textarea
          value={draftDescription}
          onChange={(e) => {
            const v = e.target.value;
            setDraftDescription(v);
            updateSceneSettings(
              (prev) => ({ ...prev, basic: { ...prev.basic, description: v } }),
              { recordHistory: false }
            );
          }}
          onBlur={() => {
            const displayValue = draftDescription || '""';
            updateSceneSettings(
              (prev) => ({ ...prev, basic: { ...prev.basic, description: draftDescription } }),
              {
                recordHistory: true,
                operationName: historyName(
                  `修改场景属性-基础设置-详细描述 = ${displayValue}`,
                  `Modify scene property - basic settings - description = ${displayValue}`
                )
              }
            );
          }}
          rows={2}
          className="w-full resize-none rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          placeholder={labels.descriptionPlaceholder}
        />
      </div>
    </div>
  );
}

