import { Tooltip } from '../../../../components/Tooltip';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import { DATA_TRANSFER_KEYS } from '../../../../utils/storageKeys';
import { getAssetUrl } from '../../../../utils/utils';

type LightPresetKey = 'ambientLight' | 'directionalLight' | 'pointLight' | 'spotLight' | 'hemisphereLight' | 'rectAreaLight';

const ICONS: Record<LightPresetKey, string> = {
  ambientLight: getAssetUrl('../../../../assets/img/ambientLight.png', import.meta.url),
  directionalLight: getAssetUrl('../../../../assets/img/directionalLight.png', import.meta.url),
  pointLight: getAssetUrl('../../../../assets/img/pointLight.png', import.meta.url),
  spotLight: getAssetUrl('../../../../assets/img/spotLight.png', import.meta.url),
  hemisphereLight: getAssetUrl('../../../../assets/img/hemisphereLight.png', import.meta.url),
  rectAreaLight: getAssetUrl('../../../../assets/img/rectAreaLight.png', import.meta.url)
};

const LIGHT_KEYS: LightPresetKey[] = [
  'ambientLight',
  'directionalLight',
  'pointLight',
  'spotLight',
  'hemisphereLight',
  'rectAreaLight'
];

export function LightList() {
  const { locale } = useLocale();
  const t = appMessages[locale];
  const LIGHT_DRAG_MIME = DATA_TRANSFER_KEYS.LIGHT_MIME;

  return (
    <div className="grid grid-cols-2 gap-2 p-4">
      {LIGHT_KEYS.map((key) => {
        const label = t.systemAssets.lightNames[key];
        return (
          <button
            key={key}
            type="button"
            draggable={true}
            onDragStart={(e) => {
              e.dataTransfer.setData(LIGHT_DRAG_MIME, key);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            className={[
              'group overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/45',
              'text-center transition-colors hover:border-[var(--border-strong)]'
            ].join(' ')}
          >
            <div
              className={[
                'relative flex h-20 w-full items-center justify-center',
                'bg-[var(--accent-soft)]/35',
                'flex items-center justify-center'
              ].join(' ')}
            >
              <img
                src={ICONS[key]}
                alt={label}
                className="h-12 w-12 object-contain"
                draggable={false}
              />
            </div>

            <div className="min-w-0 px-2.5 py-1">
              <Tooltip content={label} placement="top" triggerClassName="flex w-full min-w-0">
                <div className="w-full truncate text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                  {label}
                </div>
              </Tooltip>
            </div>
          </button>
        );
      })}
    </div>
  );
}

