import { useState } from 'react';

import { Tabs, TabItem } from '../../../components/Tabs';
import { useLocale } from '../../../hooks/useLocale';
import { appMessages } from '../../../i18n/messages';
import { SystemAssets } from './SystemAssets/index';
import { Structure } from './Structure/index';

type AssetTab = 'system' | 'mine' | 'structure';

/**
 * 左侧资产列表面板：
 * - 展示场景可用的组件/资产
 * - 通过 visible 控制显示/隐藏（配合父级 grid 动画）
 * - 横向 Tab 栏：系统资源 / 我的资源 / 结构
 */
export function AssetPane({ visible }: { visible: boolean }) {
  const [activeTab, setActiveTab] = useState<AssetTab>('system');
  const { locale } = useLocale();
  const t = appMessages[locale].assetPane;

  const tabs: TabItem<AssetTab>[] = [
    { key: 'system', label: t.systemTab },
    { key: 'mine', label: t.mineTab },
    { key: 'structure', label: t.structureTab }
  ];

  return (
    <aside
      className={[
        'relative flex h-full flex-col min-h-0 min-w-0 overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 text-sm text-[var(--text-muted)]',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      ].join(' ')}
      style={{ transition: 'opacity 180ms ease-out' }}
    >
      <Tabs
        tabs={tabs}
        activeKey={activeTab}
        onChange={setActiveTab}
        showTooltip={false}
        keepAlive={true}
        className="flex-1 min-h-0"
        contentClassName="min-h-0 overflow-hidden"
      >
        {(key) => {
          if (key === 'system') {
            return <SystemAssets />;
          }
          if (key === 'mine') {
            return <div className="h-full overflow-y-auto p-3 text-xs text-[var(--text-muted)]">{t.minePlaceholder}</div>;
          }
          if (key === 'structure') {
            return <Structure />;
          }
        }}
      </Tabs>
    </aside>
  );
}

