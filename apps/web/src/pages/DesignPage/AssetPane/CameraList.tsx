import { Tooltip } from '../../../components/Tooltip';

import { getAssetUrl } from '../../../utils/utils';

type CameraPresetKey = 'orthographic' | 'perspective';

type CameraPreset = {
  key: CameraPresetKey;
  label: string;
  iconSrc: string;
};

const CAMERA_PRESETS: CameraPreset[] = [
  {
    key: 'orthographic',
    label: '正交相机',
    iconSrc: getAssetUrl('../../../assets/img/orthographicCamera.png', import.meta.url)
  },
  {
    key: 'perspective',
    label: '透视相机',
    iconSrc: getAssetUrl('../../../assets/img/perspectiveCamera.png', import.meta.url)
  }
];

export function CameraList() {
  return (
    <div className="grid grid-cols-2 gap-2 p-4">
      {CAMERA_PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
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
              src={preset.iconSrc}
              alt={preset.label}
              className="h-10 w-10 object-contain"
              draggable={false}
            />
          </div>

          <div className="min-w-0 px-2.5 py-1">
            <Tooltip content={preset.label} placement="top" triggerClassName="flex w-full min-w-0">
              <div className="w-full truncate text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                {preset.label}
              </div>
            </Tooltip>
          </div>
        </button>
      ))}
    </div>
  );
}

