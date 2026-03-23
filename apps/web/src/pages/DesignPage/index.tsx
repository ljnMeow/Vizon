import { useState } from 'react';
import { DesignHeader } from './DesignHeader';
import { PaneHandle } from './PaneHandle';
import { AssetPane } from './AssetPane';
import { ThreeViewport } from './drawer/ThreeViewport';
import { InspectorPanel } from './Inspector';
import { SceneSettingsProvider, useSceneSettings } from '../../hooks/useSceneSettings';

/**
 * 设计页主界面：
 * - 顶部导航：单独抽离为 DesignHeader
 * - 主区域：左资产栏 / 中间画布 / 右属性栏 三栏布局
 */
function DesignPageInner() {
  const [showLeftPane, setShowLeftPane] = useState(true);
  const [showRightPane, setShowRightPane] = useState(true);
  const { registerEditor } = useSceneSettings();

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors">
      <DesignHeader />

      {/* 三栏 3D 编辑布局：左侧资产（≈20%）、中间画布（≈60%）、右侧属性（≈20%） */}
      <main
        className="grid min-h-0 overflow-hidden grid-rows-[minmax(0,1fr)]"
        style={{
          height: 'calc(100dvh - 3rem)',
          gridTemplateColumns: `${showLeftPane ? '20%' : '0px'} 1fr ${showRightPane ? '20%' : '0px'}`,
          transition: 'grid-template-columns 220ms ease-out'
        }}
      >
        <AssetPane visible={showLeftPane} />

        {/* 中间画布区域 */}
        <section className="relative flex h-full min-h-0 flex-1 flex-col bg-[var(--bg-elevated)]/80 text-sm text-[var(--text-muted)]">
          <div className="flex flex-1 min-h-0 items-stretch justify-stretch text-[var(--text-muted)] transition-colors duration-200">
            <ThreeViewport onEditorReady={registerEditor} />
          </div>

          {/* 左边缘把手：左侧显示时用于收起；隐藏时用于展开 */}
          <PaneHandle
            edge="left"
            arrowDirection={!showLeftPane ? 'left' : 'right'}
            ariaLabel={showLeftPane ? 'Collapse left pane' : 'Expand left pane'}
            onClick={() => setShowLeftPane(!showLeftPane)}
          />

          {/* 右边缘把手：右侧显示时用于收起；隐藏时用于展开 */}
          <PaneHandle
            edge="right"
            arrowDirection={!showRightPane ? 'right' : 'left'}
            ariaLabel={showRightPane ? 'Collapse right pane' : 'Expand right pane'}
            onClick={() => setShowRightPane(!showRightPane)}
          />
        </section>

        {/* 右侧属性配置：保持挂载，通过列宽动画实现折叠/展开 */}
        <InspectorPanel visible={showRightPane} />
      </main>
    </div>
  );
}

export default function DesignPage() {
  return (
    <SceneSettingsProvider>
      <DesignPageInner />
    </SceneSettingsProvider>
  );
}
