/**
 * 项目面板：展示并管理用户在服务端保存的场景列表。
 *
 * 功能：
 * - 挂载时自动拉取当前用户的场景列表
 * - 展示场景卡片（缩略图 / 名称 / 更新时间 / 文件大小）
 * - 支持「载入」（下载 bundle 并导入编辑器）和「删除」操作
 * - 支持手动「刷新」列表
 */

import { useEffect, useState } from 'react';
import { importDocument } from 'vizon-3d-core';

import { dialog } from '../../../../components/GlobalDialog';
import { message } from '../../../../components/GlobalMessage';
import { useLoadedScene } from '../../../../hooks/useLoadedScene';
import { useLocale } from '../../../../hooks/useLocale';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { appMessages } from '../../../../i18n/messages';
import { type SceneMeta, deleteScene, downloadSceneBundle, listScenes } from '../../../../api/scenes';
import { importProjectBundle } from '../../../../utils/documentBundle';
import { encodeHistoryI18nName } from '../../../../utils/historyI18n';

/** 将字节数格式化为人类可读的文件大小字符串。 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 按钮通用样式：小号、圆角、带边框。 */
const btnBase =
  'rounded border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40';

/**
 * 项目面板：场景卡片列表。
 *
 * 卡片结构（竖向列表）：
 * ┌─────────────────────────────┐
 * │ [缩略图 / 灰底占位]          │
 * │ 场景名                       │
 * │ 更新时间  大小               │
 * │             [载入]  [删除]   │
 * └─────────────────────────────┘
 */
export function ProjectPanel({ isActive }: { isActive: boolean }) {
  const { locale } = useLocale();
  const t = appMessages[locale].userAssets;
  const { editor } = useSceneSettings();
  const { loadedSceneId, setLoadedSceneId } = useLoadedScene();

  const [scenes, setScenes] = useState<SceneMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 正在载入的场景 ID，用于禁用该卡片的按钮
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // 正在删除的场景 ID
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** 拉取场景列表。 */
  const fetchScenes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listScenes();
      setScenes(data);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw || t.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  // Tab 激活时加载列表；isActive 从 false→true 触发一次，切走后不重复请求
  useEffect(() => {
    if (!isActive) return;
    void fetchScenes();
    // fetchScenes 依赖稳定，不需要加入 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  /**
   * 载入场景：下载 bundle ZIP → 包装成 File → 通过编辑器历史机制导入。
   * 载入前记录当前文档快照，支持撤销。
   */
  const onLoadScene = async (scene: SceneMeta) => {
    if (!editor) return;
    setLoadingId(scene.scene_id);
    // 初始显示 0% 进度条，阶段一：下载
    const loadingHandle = message.loading(`${t.loadSceneDownloading} 0%`);
    loadingHandle.update({ progress: 0 });
    try {
      // 阶段一：下载 bundle，实时更新进度条 0→80
      const blob = await downloadSceneBundle(scene.scene_id, (percent) => {
        loadingHandle.update({
          text: `${t.loadSceneDownloading} ${percent}%`,
          progress: Math.round(percent * 0.8)
        });
      });
      const file = new File([blob], 'bundle.zip', { type: 'application/zip' });

      // 阶段二：导入到编辑器，进度从 80% 继续到 100%
      loadingHandle.update({ text: t.loadSceneImporting, progress: 80 });

      const before = editor.getVizonDocument({ generator: 'apps/web-user-assets' });

      await editor.executeHistoryOperation({
        name: encodeHistoryI18nName({
          'zh-CN': `载入场景 - ${scene.name || t.noName}`,
          'en-US': `Load scene - ${scene.name || t.noName}`
        }),
        do: async () => {
          await importProjectBundle(editor, file, (percent) => {
            // 导入阶段映射到进度条的 80-100 区间
            loadingHandle.update({
              text: t.loadSceneImporting,
              progress: Math.round(80 + percent * 0.2)
            });
          });
        },
        undo: async () => {
          await importDocument(editor, before);
        },
        redo: async () => {
          await importProjectBundle(editor, file);
        }
      });

      loadingHandle.hide();
      void message.success(t.loadSceneSuccess);
      // 记录已载入的场景，供删除时判断是否需要清空编辑器
      setLoadedSceneId(scene.scene_id);
    } catch (err) {
      loadingHandle.hide();
      const raw = err instanceof Error ? err.message : String(err);
      void message.error(`${t.loadSceneFailedPrefix}${raw}`);
    } finally {
      setLoadingId(null);
    }
  };

  /**
   * 删除场景：弹出 confirm 确认后调用 API，乐观更新列表。
   * 若删除的是当前已载入的场景，同步重置编辑器画布。
   */
  const onDeleteScene = async (scene: SceneMeta) => {
    const name = scene.name || t.noName;
    const confirmed = await dialog.confirm({
      title: t.deleteConfirmTitle,
      content: `${t.deleteConfirmPrefix}${name}${t.deleteConfirmSuffix}`,
      danger: true,
      confirmText: t.deleteScene,
    });
    if (!confirmed) return;
    setDeletingId(scene.scene_id);
    try {
      await deleteScene(scene.scene_id);
      // 乐观更新：从本地列表移除，无需重新请求
      setScenes((prev) => prev.filter((s) => s.scene_id !== scene.scene_id));
      // 删除的是当前载入的场景时，重置编辑器（清空节点 + 还原默认场景设置）
      if (editor && loadedSceneId === scene.scene_id) {
        await editor.resetWorkspace();
        setLoadedSceneId(null);
      }
      void message.success(t.deleteSuccess);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      void message.error(`${t.deleteFailedPrefix}${raw}`);
    } finally {
      setDeletingId(null);
    }
  };

  // ——— 状态渲染 ———

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
        {appMessages[locale].common.loading}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-[var(--text-muted)]">
        <span className="text-[var(--color-error,#ef4444)]">{error}</span>
        <button
          type="button"
          onClick={() => { void fetchScenes(); }}
          className={btnBase + ' text-[var(--text-secondary)]'}
        >
          {t.refresh}
        </button>
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{t.emptyProjects}</p>
        <button
          type="button"
          onClick={() => { void fetchScenes(); }}
          className={btnBase + ' text-[var(--text-secondary)]'}
        >
          {t.refresh}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* 顶部刷新按钮 */}
      <div className="flex shrink-0 items-center justify-end px-2 py-1">
        <button
          type="button"
          onClick={() => { void fetchScenes(); }}
          disabled={loading}
          className={btnBase + ' text-[var(--text-secondary)]'}
        >
          {t.refresh}
        </button>
      </div>

      {/* 场景卡片列表（可滚动） */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-2">
        {scenes.map((scene) => {
          const isBusy = loadingId === scene.scene_id || deletingId === scene.scene_id;
          const name = scene.name || t.noName;

          return (
            <div
              key={scene.scene_id}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
            >
              {/* 缩略图区域（16:9 比例） */}
              <div className="relative w-full bg-[var(--bg-base)]" style={{ paddingTop: '56.25%' }}>
                {scene.thumbnail_url ? (
                  <img
                    src={scene.thumbnail_url}
                    alt={name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  // 无缩略图时显示灰色占位
                  <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)] text-xs">
                    —
                  </div>
                )}
              </div>

              {/* 信息区域 */}
              <div className="p-2">
                {/* 场景名 */}
                <p
                  className="truncate text-xs font-medium text-[var(--text-primary)] leading-tight"
                  title={name}
                >
                  {name}
                </p>

                {/* 次要信息：更新时间 + 文件大小 */}
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)] flex items-center justify-between">
                  <span className="truncate">{scene.updated_at}</span>
                  <span className="ml-2 shrink-0">{formatSize(scene.bundle_size)}</span>
                </p>

                {/* 操作按钮 */}
                <div className="mt-1.5 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => { void onLoadScene(scene); }}
                    disabled={isBusy || !editor}
                    className={btnBase + ' text-[var(--text-secondary)]'}
                  >
                    {loadingId === scene.scene_id ? '...' : t.loadScene}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void onDeleteScene(scene); }}
                    disabled={isBusy}
                    className={btnBase + ' text-[var(--text-secondary)] hover:text-[var(--color-error,#ef4444)]'}
                  >
                    {deletingId === scene.scene_id ? '...' : t.deleteScene}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
