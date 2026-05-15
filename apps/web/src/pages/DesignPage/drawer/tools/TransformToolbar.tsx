import { Tooltip } from '../../../../components/Tooltip';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import { getAssetUrl } from '../../../../utils/utils';

/** 视口变换工具类型：移动、缩放、旋转 */
export type ViewportTool = 'translate' | 'scale' | 'rotate';

/**
 * 视口变换工具栏，居中悬浮于视口顶部。
 * 点击已激活的工具按钮可关闭工具（此时视口进入纯相机交互模式）。
 * snapEnabled 控制变换吸附开关，开启后平移/旋转/缩放按固定步长对齐。
 */
export function TransformToolbar({
  value,
  onChange,
  snapEnabled,
  onSnapChange
}: {
  /**
   * 工具可以为 null：表示未选中工具，此时不做拾取/变换交互（只允许相机交互）。
   */
  value: ViewportTool | null;
  onChange: (next: ViewportTool | null) => void;
  snapEnabled: boolean;
  onSnapChange: (enabled: boolean) => void;
}) {
  const { locale } = useLocale();
  const t = appMessages[locale];
  const snapIcon = getAssetUrl('../../../../assets/svg/snap.svg', import.meta.url);
  const snapLabel = t.designPage.viewport.tools.snap;

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
      <div className="mx-0.5 h-4 w-px bg-[var(--border-subtle)]" />
      <Tooltip content={snapLabel} placement="bottom">
        <button
          type="button"
          onClick={() => onSnapChange(!snapEnabled)}
          className={[
            'inline-flex h-[26px] w-[26px] items-center justify-center rounded-full transition',
            'hover:bg-[var(--bg-elevated)]/70 active:bg-[var(--bg-elevated)]',
            snapEnabled ? 'bg-[var(--bg-elevated)] ring-1 ring-[var(--border-subtle)]' : 'bg-transparent'
          ].join(' ')}
          aria-label={snapLabel}
        >
          <img src={snapIcon} alt="" className="h-3.5 w-3.5 opacity-80" />
        </button>
      </Tooltip>
    </div>
  );
}

