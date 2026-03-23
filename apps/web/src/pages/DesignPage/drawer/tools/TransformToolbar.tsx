import { Tooltip } from '../../../../components/Tooltip';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import { getAssetUrl } from '../../../../utils/utils';

export type ViewportTool = 'translate' | 'scale' | 'rotate';

export function TransformToolbar({
  value,
  onChange
}: {
  /**
   * 工具可以为 null：表示未选中工具，此时不做拾取/变换交互（只允许相机交互）。
   */
  value: ViewportTool | null;
  onChange: (next: ViewportTool | null) => void;
}) {
  const { locale } = useLocale();
  const t = appMessages[locale];

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 -translate-x-1/2 flex items-center gap-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/85 p-0.5 text-xs text-[var(--text-primary)] shadow-sm backdrop-blur">
      {(
        [
          ['translate', getAssetUrl('../../../../assets/svg/translation.svg', import.meta.url)],
          ['scale', getAssetUrl('../../../../assets/svg/zoom.svg', import.meta.url)],
          ['rotate', getAssetUrl('../../../../assets/svg/rotate.svg', import.meta.url)]
        ] as const
      ).map(([key, iconUrl]) => {
        const label = (t.designPage.viewport.tools as Record<string, string>)[key === 'scale' ? 'zoom' : key] ?? key;
        return (
          <Tooltip key={key} content={label} placement="bottom">
            <button
              type="button"
              onClick={() => onChange(value === key ? null : key)}
              className={[
                'inline-flex h-[26px] w-[26px] items-center justify-center rounded-full transition',
                'hover:bg-[var(--bg-elevated)]/70 active:bg-[var(--bg-elevated)]',
                value === key ? 'bg-[var(--bg-elevated)] ring-1 ring-[var(--border-subtle)]' : 'bg-transparent'
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

