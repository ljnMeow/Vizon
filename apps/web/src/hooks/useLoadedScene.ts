/**
 * 服务端已载入场景追踪 Context。
 *
 * 职责：
 * - 记录当前编辑器中载入的服务端场景 ID（来自 /api/scenes/）
 * - 供 ProjectPanel（载入/删除时设置）和 ActionBar（保存时判断新建/覆盖）共享
 *
 * 设计要点：
 * - 刻意独立于 useSceneSettings，避免将服务端概念耦合进编辑器核心状态。
 * - 仅当用户主动从「我的资源」面板载入场景时才设置；手动导入 JSON/Bundle 不影响此值。
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type LoadedSceneContextValue = {
  /** 当前已从服务端载入的场景 ID；null 表示未载入任何服务端场景。 */
  loadedSceneId: string | null;
  /** 载入场景后调用，记录其 scene_id。 */
  setLoadedSceneId: (id: string | null) => void;
};

const LoadedSceneContext = createContext<LoadedSceneContextValue | null>(null);

/** 将服务端已载入场景状态注入子树。挂载于 DesignPage 顶层。 */
export function LoadedSceneProvider({ children }: { children: React.ReactNode }) {
  const [loadedSceneId, setLoadedSceneIdState] = useState<string | null>(null);

  const setLoadedSceneId = useCallback((id: string | null) => {
    setLoadedSceneIdState(id);
  }, []);

  const value = useMemo<LoadedSceneContextValue>(
    () => ({ loadedSceneId, setLoadedSceneId }),
    [loadedSceneId, setLoadedSceneId]
  );

  return React.createElement(LoadedSceneContext.Provider, { value }, children);
}

/** 读取/设置当前已载入的服务端场景 ID。必须在 LoadedSceneProvider 内使用。 */
export function useLoadedScene() {
  const ctx = useContext(LoadedSceneContext);
  if (!ctx) throw new Error('useLoadedScene must be used within LoadedSceneProvider');
  return ctx;
}
