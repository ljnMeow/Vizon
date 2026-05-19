/**
 * 我的资源面板：纵向 Tabs，展示用户私有资产。
 *
 * 当前 Tab：
 * - 项目（project）：用户保存的场景列表
 * - 贴图（texture）：用户上传的贴图资源库
 *
 * 结构参照 SystemAssets/index.tsx，保持一致的纵向布局风格。
 */

import { useState } from 'react';

import { Tabs, type TabItem } from '../../../../components/Tabs';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import { ProjectPanel } from './project';
import { TexturePanel } from './texture';

type UserAssetTab = 'project' | 'texture';

/** 我的资源面板，含「项目」「贴图」子 Tab。 */
export function UserAssets({ isActive }: { isActive: boolean }) {
  const [activeTab, setActiveTab] = useState<UserAssetTab>('project');
  const { locale } = useLocale();
  const t = appMessages[locale].userAssets;

  const tabs: TabItem<UserAssetTab>[] = [
    { key: 'project', label: t.projectTab },
    { key: 'texture', label: t.textureTab }
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
        if (key === 'project') {
          return (
            <div className="flex min-h-0 flex-col h-full">
              <ProjectPanel isActive={isActive} />
            </div>
          );
        }
        if (key === 'texture') {
          return (
            <div className="flex min-h-0 flex-col h-full">
              <TexturePanel isActive={isActive && activeTab === 'texture'} />
            </div>
          );
        }
      }}
    </Tabs>
  );
}
