import { useState } from 'react';

import { Tabs, type TabItem } from '../../../components/Tabs';
import { useLocale } from '../../../hooks/useLocale';
import { appMessages } from '../../../i18n/messages';
import { SceneSettings } from './SceneSettings/index';

type InspectorTab = 'scene' | 'data' | 'interaction';

export function InspectorPanel({ visible }: { visible: boolean }) {
  const { locale } = useLocale();
  const t = appMessages[locale].designPage.inspector;
  const [activeTab, setActiveTab] = useState<InspectorTab>('scene');

  const tabs: TabItem<InspectorTab>[] = [
    { key: 'scene', label: t.tabs.scene },
    { key: 'data', label: t.tabs.data },
    { key: 'interaction', label: t.tabs.interaction }
  ];

  return (
    <aside
      className={[
        'relative h-full min-h-0 overflow-hidden border-l border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 p-0 text-sm text-[var(--text-muted)]',
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
        {(key) => (
          <div className="h-full overflow-y-auto p-3 text-xs text-[var(--text-muted)]">
            {key === 'scene' ? <SceneSettings /> : t.placeholders[key]}
          </div>
        )}
      </Tabs>
    </aside>
  );
}

