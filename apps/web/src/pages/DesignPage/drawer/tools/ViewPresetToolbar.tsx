import { Tooltip } from '../../../../components/Tooltip';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import { getAssetUrl } from '../../../../utils/utils';
import type { ViewPreset } from 'vizon-3d-core';

export function ViewPresetToolbar({ value, onChange }: { value: ViewPreset; onChange: (next: ViewPreset) => void }) {
  const { locale } = useLocale();
  const t = appMessages[locale];

  return (
    <div className="pointer-events-auto absolute left-3 top-3 flex items-center gap-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/85 p-0.5 text-xs text-[var(--text-primary)] shadow-sm backdrop-blur">
      {(
        [
          ['default', getAssetUrl('../../../../assets/svg/default-view.svg', import.meta.url)],
          ['front', getAssetUrl('../../../../assets/svg/front-view.svg', import.meta.url)],
          ['back', getAssetUrl('../../../../assets/svg/back-view.svg', import.meta.url)],
          ['left', getAssetUrl('../../../../assets/svg/left-view.svg', import.meta.url)],
          ['right', getAssetUrl('../../../../assets/svg/right-view.svg', import.meta.url)],
          ['top', getAssetUrl('../../../../assets/svg/top-view.svg', import.meta.url)],
          ['bottom', getAssetUrl('../../../../assets/svg/bottom-view.svg', import.meta.url)]
        ] as const
      ).map(([preset, iconUrl]) => {
        const label = (t.designPage.viewport.viewPresets as Record<string, string>)[preset] ?? preset;
        return (
          <Tooltip key={preset} content={label} placement="bottom">
            <button
              type="button"
              onClick={() => onChange(preset)}
              className={[
                'inline-flex h-[26px] w-[26px] items-center justify-center rounded-full transition',
                'hover:bg-[var(--bg-elevated)]/70 active:bg-[var(--bg-elevated)]',
                value === preset ? 'bg-[var(--bg-elevated)] ring-1 ring-[var(--border-subtle)]' : 'bg-transparent'
              ].join(' ')}
              aria-label={label}
            >
              <img src={iconUrl} alt="" className="h-3.5 w-3.5 opacity-80" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

