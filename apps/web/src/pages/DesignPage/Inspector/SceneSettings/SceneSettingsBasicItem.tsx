import { useSceneSettings } from '../../../../hooks/useSceneSettings';

export type SceneSettingsBasicLabels = {
  title: string;
  sceneNameLabel: string;
  sceneNamePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
};

export function SceneSettingsBasicItem({ labels }: { labels: SceneSettingsBasicLabels }) {
  const { sceneSettings, setSceneName, setDescription } = useSceneSettings();
  const { sceneName, description } = sceneSettings.basic;

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
          {labels.sceneNameLabel}
        </label>
        <input
          value={sceneName}
          onChange={(e) => setSceneName(e.target.value)}
          className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          placeholder={labels.sceneNamePlaceholder}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
          {labels.descriptionLabel}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          placeholder={labels.descriptionPlaceholder}
        />
      </div>
    </div>
  );
}

