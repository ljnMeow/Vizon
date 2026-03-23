import { useState } from 'react';

import { Tabs, TabItem } from '../../../components/Tabs';
import { useLocale } from '../../../hooks/useLocale';
import { appMessages } from '../../../i18n/messages';
import { CameraList } from './CameraList';
import { ModelList } from './ModelList';
import { LightList } from './LightList';

type SystemAssetTab = 'models' | 'cameras' | 'lights' | 'materials';

/**
 * 系统资源面板：
 * - 纵向 Tab 栏：模型 / 相机 / 灯光 / 材质
 * - 展示系统预设的 3D 资源
 */
export function SystemAssets() {
  const [activeTab, setActiveTab] = useState<SystemAssetTab>('models');
  const { locale } = useLocale();
  const t = appMessages[locale].systemAssets;

  const tabs: TabItem<SystemAssetTab>[] = [
    { key: 'models', label: t.modelsTab },
    { key: 'cameras', label: t.camerasTab },
    { key: 'lights', label: t.lightsTab },
    { key: 'materials', label: t.materialsTab }
  ];

  return (
    <Tabs
      tabs={tabs}
      activeKey={activeTab}
      onChange={setActiveTab}
      orientation="vertical"
      className="flex-1 min-h-0"
      contentClassName="p-1 min-h-0 overflow-hidden"
    >
      {(key) => {
        if (key === 'models') {
          return (
            <div className="flex min-h-0 flex-col gap-2">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <ModelList />
              </div>
            </div>
          );
        }
        if (key === 'cameras') {
          return (
            <div className="flex min-h-0 flex-col gap-2">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <CameraList />
              </div>
            </div>
          );
        }
        if (key === 'lights') {
          return (
            <div className="flex min-h-0 flex-col gap-2">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <LightList />
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-2">
            <div className="text-xs text-[var(--text-muted)]">{t.materialsPlaceholder}</div>
            {/* TODO: 材质列表 */}
          </div>
        );
      }}
    </Tabs>
  );
}

