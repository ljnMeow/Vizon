/**
 * 我的资源面板：纵向 Tabs，展示用户私有资产。
 *
 * 当前 Tab：
 * - 项目（project）：用户保存的场景列表
 *
 * 结构参照 SystemAssets/index.tsx，保持一致的纵向布局风格。
 */

import { useState } from 'react';

import { Tabs, type TabItem } from '../../../../components/Tabs';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import { ProjectPanel } from './project';

type UserAssetTab = 'project';

/** 我的资源面板，含「项目」子 Tab。 */
export function UserAssets({ isActive }: { isActive: boolean }) {
  const [activeTab, setActiveTab] = useState<UserAssetTab>('project');
  const { locale } = useLocale();
  const t = appMessages[locale].userAssets;

  const tabs: TabItem<UserAssetTab>[] = [
    { key: 'project', label: t.projectTab }
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
      }}
    </Tabs>
  );
}
