import { useEffect, useMemo, useState } from 'react';

import { Tabs, type TabItem } from '../../../components/Tabs';
import { useLocale } from '../../../hooks/useLocale';
import { useSceneSettings } from '../../../hooks/useSceneSettings';
import { appMessages } from '../../../i18n/messages';
import { SceneSettings } from './SceneSettings/index';
import { PropertiesSettings } from './Properties/index';
import { MaterialSettings } from './Material/index';
import { EffectsSettings } from './effects/index';

/** 检视器顶部标签页的合法 key 值 */
type InspectorTab = 'scene' | 'data' | 'interaction' | 'properties' | 'materials' | 'effects';

/**
 * 当前选中对象类型：
 * - none：未选中任何对象，展示场景/数据/交互三标签
 * - mesh：选中的是 Mesh，额外展示材质与特效标签
 * - other：选中非 Mesh 对象（灯光/相机等），只展示属性标签
 */
type InspectorMode = 'none' | 'mesh' | 'other';

function isThreeMesh(obj: unknown): boolean {
  if (!obj) return false;
  const o = obj as any;
  // three.js Mesh 通常有 `isMesh=true`，也可能用 `type === 'Mesh'` 兜底
  return Boolean(o?.isMesh) || o?.type === 'Mesh';
}

/**
 * 右侧检视器面板。
 * 根据当前选中对象类型（Mesh/非Mesh/无选中）动态调整标签页，
 * 并在每次模式切换时自动跳转到第一个标签。
 */
export function InspectorPanel({ visible }: { visible: boolean }) {
  const { locale } = useLocale();
  const t = appMessages[locale].designPage.inspector;
  const { editor } = useSceneSettings();
  const [activeTab, setActiveTab] = useState<InspectorTab>('scene');
  const [mode, setMode] = useState<InspectorMode>('none');

  useEffect(() => {
    if (!editor) return;

    const syncFromSelected = (object: unknown) => {
      if (!object) {
        setMode('none');
        return;
      }
      setMode(isThreeMesh(object) ? 'mesh' : 'other');
    };

    syncFromSelected(editor.getSelected());

    const off = editor.on('select', ({ object }) => {
      syncFromSelected(object);
    });

    return off;
  }, [editor]);

  const tabs = useMemo<TabItem<InspectorTab>[]>(() => {
    if (mode === 'none') {
      return [
        { key: 'scene', label: t.tabs.scene },
        { key: 'data', label: t.tabs.data },
        { key: 'interaction', label: t.tabs.interaction }
      ];
    }

    if (mode === 'mesh') {
      return [
        { key: 'properties', label: t.tabs.properties },
        { key: 'materials', label: t.tabs.materials },
        { key: 'effects', label: t.tabs.effects }
      ];
    }

    // other：只展示属性
    return [{ key: 'properties', label: t.tabs.properties }];
  }, [mode, t.tabs.data, t.tabs.effects, t.tabs.interaction, t.tabs.materials, t.tabs.properties, t.tabs.scene]);

  // 切换模式时，始终默认展示第一个 tab
  useEffect(() => {
    setActiveTab(tabs[0].key);
  }, [tabs]); // tabs 由 mode 推导，不依赖 activeTab 点击

  const activeKey = activeTab;

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
        activeKey={activeKey}
        onChange={setActiveTab}
        showTooltip={false}
        keepAlive={true}
        className="flex-1 min-h-0"
        contentClassName="min-h-0 overflow-hidden"
      >
        {(key) => (
          <div className="h-full overflow-y-auto p-3 text-xs text-[var(--text-muted)]">
            {key === 'scene' ? (
              <SceneSettings />
            ) : key === 'materials' ? (
              <MaterialSettings />
            ) : key === 'properties' ? (
              <PropertiesSettings />
            ) : key === 'effects' ? (
              <EffectsSettings />
            ) : (
              t.placeholders[key]
            )}
          </div>
        )}
      </Tabs>
    </aside>
  );
}

