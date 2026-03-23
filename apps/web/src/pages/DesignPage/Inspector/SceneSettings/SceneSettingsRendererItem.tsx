import { Select } from '../../../../components/Select';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';

export type SceneSettingsRendererLabels = {
  title: string;

  antialiasLabel: string;

  outputColorSpaceLabel: string;
  outputColorSpaceOptions: {
    SRGBColorSpace: string;
    LinearSRGBColorSpace: string;
  };

  toneMappingLabel: string;
  toneMappingOptions: {
    NoToneMapping: string;
    LinearToneMapping: string;
    ReinhardToneMapping: string;
    CineonToneMapping: string;
    ACESFilmicToneMapping: string;
  };

  toneMappingExposureLabel: string;

  shadowMapEnabledLabel: string;
  shadowMapTypeLabel: string;
  shadowMapTypeOptions: {
    BasicShadowMap: string;
    PCFShadowMap: string;
    PCFSoftShadowMap: string;
  };

  shadowMapAutoUpdateLabel: string;
};

export function SceneSettingsRendererItem({ labels }: { labels: SceneSettingsRendererLabels }) {
  const {
    rendererSettings,
    setAntialias,
    setOutputColorSpace,
    setToneMapping,
    setToneMappingExposure,
    setShadowMapEnabled,
    setShadowMapType,
    setShadowMapAutoUpdate
  } = useSceneSettings();

  const { antialias, outputColorSpace, toneMapping, toneMappingExposure, shadowMapEnabled } = rendererSettings;
  const { shadowMapType, shadowMapAutoUpdate } = rendererSettings;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
            {labels.antialiasLabel}
          </span>
          <input
            type="checkbox"
            checked={antialias}
            onChange={(e) => setAntialias(e.target.checked)}
            className="h-4 w-4"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
          {labels.outputColorSpaceLabel}
        </label>
        <Select
          value={outputColorSpace}
          onChange={(v) => {
            if (!v) return;
            setOutputColorSpace(v);
          }}
          options={[
            { value: 'SRGBColorSpace', label: labels.outputColorSpaceOptions.SRGBColorSpace },
            { value: 'LinearSRGBColorSpace', label: labels.outputColorSpaceOptions.LinearSRGBColorSpace }
          ]}
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
          {labels.toneMappingLabel}
        </label>
        <Select
          value={toneMapping}
          onChange={(v) => {
            if (!v) return;
            setToneMapping(v);
          }}
          options={[
            { value: 'NoToneMapping', label: labels.toneMappingOptions.NoToneMapping },
            { value: 'LinearToneMapping', label: labels.toneMappingOptions.LinearToneMapping },
            { value: 'ReinhardToneMapping', label: labels.toneMappingOptions.ReinhardToneMapping },
            { value: 'CineonToneMapping', label: labels.toneMappingOptions.CineonToneMapping },
            { value: 'ACESFilmicToneMapping', label: labels.toneMappingOptions.ACESFilmicToneMapping }
          ]}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
            {labels.toneMappingExposureLabel}
          </label>
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
            {toneMappingExposure.toFixed(2)}
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={10}
          step={0.01}
          value={toneMappingExposure}
          onChange={(e) => {
            if (toneMapping === 'NoToneMapping') return;
            setToneMappingExposure(Number(e.target.value));
          }}
          disabled={toneMapping === 'NoToneMapping'}
          className="w-full disabled:opacity-50"
        />
      </div>

      <div className="space-y-1">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
            {labels.shadowMapEnabledLabel}
          </span>
          <input
            type="checkbox"
            checked={shadowMapEnabled}
            onChange={(e) => setShadowMapEnabled(e.target.checked)}
            className="h-4 w-4"
          />
        </label>
      </div>

      {shadowMapEnabled ? (
        <>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
              {labels.shadowMapTypeLabel}
            </label>
            <Select
              value={shadowMapType}
              onChange={(v) => {
                if (!v) return;
                setShadowMapType(v);
              }}
              options={[
                { value: 'BasicShadowMap', label: labels.shadowMapTypeOptions.BasicShadowMap },
                { value: 'PCFShadowMap', label: labels.shadowMapTypeOptions.PCFShadowMap },
                { value: 'PCFSoftShadowMap', label: labels.shadowMapTypeOptions.PCFSoftShadowMap }
              ]}
            />
          </div>

          <div className="space-y-1">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
                {labels.shadowMapAutoUpdateLabel}
              </span>
              <input
                type="checkbox"
                checked={shadowMapAutoUpdate}
                onChange={(e) => setShadowMapAutoUpdate(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
          </div>
        </>
      ) : null}
    </div>
  );
}

