import { Tooltip } from '../../../../components/Tooltip';

import { appMessages } from '../../../../i18n/messages';
import { useLocale } from '../../../../hooks/useLocale';
import { getAssetUrl } from '../../../../utils/utils';
import { DATA_TRANSFER_KEYS } from '../../../../utils/storageKeys';

type CameraPresetKey = 'orthographic' | 'perspective';

const CAMERA_ICON_SRC: Record<CameraPresetKey, string> = {
  orthographic: getAssetUrl('../../../../assets/img/orthographicCamera.png', import.meta.url),
  perspective: getAssetUrl('../../../../assets/img/perspectiveCamera.png', import.meta.url)
};

const CAMERA_PRESET_KEYS: CameraPresetKey[] = ['orthographic', 'perspective'];

export function CameraList() {
  const { locale } = useLocale();
  const t = appMessages[locale].systemAssets.cameraNames;
  const CAMERA_DRAG_MIME = DATA_TRANSFER_KEYS.CAMERA_MIME;
  return (
    <div className="grid grid-cols-2 gap-2 p-4">
      {CAMERA_PRESET_KEYS.map((key) => {
        const label = t[key];
        return (
          <button
          key={key}
          type="button"
          draggable={true}
          onDragStart={(e) => {
            e.dataTransfer.setData(CAMERA_DRAG_MIME, key);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          className={[
            'group overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/45',
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
              src={CAMERA_ICON_SRC[key]}
              alt={label}
              className="h-10 w-10 object-contain"
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

