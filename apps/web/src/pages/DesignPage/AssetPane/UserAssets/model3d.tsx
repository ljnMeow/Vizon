/**
 * 模型资源面板：展示并管理用户上传的 3D 模型资源。
 *
 * 功能：
 * - 分类列表滚动分页；展开分类时 GET ?category= 拉全量（后端返回数组，非分页结构）
 * - 默认展开第一个分类；搜索仅在已加载模型中本地过滤
 * - Accordion 按分类分组展示模型
 * - 分类 CRUD：新建、重命名（编辑图标）、删除（有模型时 warning）
 * - 模型卡片：缩略图预览、双击重命名
 * - 批量选择 + 批量删除 + 批量移动
 * - 多文件上传，新上传归入默认分类
 * - 模糊搜索过滤模型
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useFetchOnFirstActive } from '../../../../hooks/useFetchOnFirstActive';
import { useBulkSelection } from '../../../../hooks/useBulkSelection';

import { Accordion } from '../../../../components/Accordion';
import { ListScrollFooter } from '../../../../components/ListScrollFooter';
import {
  SCROLL_LOAD_THRESHOLD_PX,
  useInfiniteScrollList,
} from '../../../../hooks/useInfiniteScrollList';
import { usePerCategoryModels } from '../../../../hooks/usePerCategoryModels';
import { Tooltip } from '../../../../components/Tooltip';
import { dialog } from '../../../../components/GlobalDialog';
import { message } from '../../../../components/GlobalMessage';
import { useImagePreview } from '../../../../components/ImagePreviewContext';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import { DATA_TRANSFER_KEYS } from '../../../../utils/keys';
import {
  type Model3dCategory,
  type Model3dMeta,
  type CompressionProgress,
  createModel3dCategory,
  deleteModel3d,
  deleteModel3dCategory,
  fetchModel3dCategoriesPage,
  fetchModel3dsPage,
  updateModel3d,
  updateModel3dCategory,
  updateModel3dThumbnail,
  uploadModel3dWithProgress,
  watchCompressionProgress,
} from '../../../../api/model3ds';
import { getApiErrorMessage } from '../../../../utils/apiError';
import { formatSize } from '../../../../utils/format';
import { generateModel3dThumbnail, generateModel3dThumbnailFromUrl } from 'vizon-3d-core';

/** 压缩阶段对应的中文提示文本（含百分比）。 */
function _getStageText(
  progress: CompressionProgress,
  _t: Record<string, string>,
): string {
  const pct = progress.percent ?? 0;
  switch (progress.stage) {
    case 'converting':
      return `转换格式中 ${pct}%`;
    case 'draco':
      return `压缩几何数据 ${pct}%`;
    case 'saving':
      return '保存中';
    default:
      return `处理中 ${pct}%`;
  }
}

/** 按钮通用样式。 */
const btnBase =
  'rounded border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40';

/** 允许上传的模型文件扩展名。 */
const MODEL_ACCEPT = '.gltf,.glb,.obj,.stl,.zip';

/** 分类名称最大长度。 */
const CATEGORY_NAME_MAX_LENGTH = 10;

/** 分类选择器（弹窗内使用）。 */
function CategoryPicker({
  categories,
  onSelect,
}: {
  categories: Model3dCategory[];
  onSelect: (categoryId: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 max-h-72 overflow-y-auto py-1 min-w-[320px]">
      {categories.map((cat) => (
        <button
          key={cat.category_id}
          type="button"
          onClick={() => onSelect(cat.category_id)}
          className="rounded px-2.5 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
        >
          <span className="block truncate">{cat.name}</span>
          <span className="block text-[10px] text-[var(--text-muted)] mt-0.5">{cat.model_count} 个模型</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 模型资源面板。
 */
export function Model3dPanel({ isActive }: { isActive: boolean }) {
  const { locale } = useLocale();
  const t = appMessages[locale].userAssets.model3dLibrary;
  const { openPreview } = useImagePreview();

  const [searchQuery, setSearchQuery] = useState('');
  const [openCategoryKey, setOpenCategoryKey] = useState<string | null>(null);

  const {
    items: categories,
    refresh: refreshCategories,
    loadMore: loadMoreCategories,
    loading: loadingCategories,
    loadingMore: loadingMoreCategories,
    hasMore: hasMoreCategories,
    error: categoriesError,
  } = useInfiniteScrollList<Model3dCategory>({
    fetchPage: fetchModel3dCategoriesPage,
  });

  const searchQueryNorm = searchQuery.trim().toLowerCase();

  // 搜索模式：走服务端分页，可搜到所有模型（不受已加载分类限制）
  const isSearchMode = searchQueryNorm.length > 0;
  const {
    items: searchResults,
    loading: searchLoading,
    loadingMore: searchLoadingMore,
    hasMore: searchHasMore,
    error: searchError,
    refresh: refreshSearch,
    loadMore: loadMoreSearch,
    onListScroll: onSearchListScroll,
  } = useInfiniteScrollList<Model3dMeta>({
    fetchPage: useCallback(
      (page: number) => fetchModel3dsPage(page, undefined, undefined, searchQueryNorm),
      [searchQueryNorm]
    ),
    resetKey: searchQueryNorm,
    enabled: isSearchMode,
  });

  const {
    getSlot,
    ensureLoaded,
    refreshCategory,
    clearAll: clearCategoryModels,
    upsertModel,
    removeModels,
    moveModelToCategory,
    getAllLoadedModels,
  } = usePerCategoryModels();

  const openSlot = openCategoryKey ? getSlot(openCategoryKey) : null;

  // 搜索模式下用搜索状态，否则用分类列表状态
  const loading = isSearchMode
    ? searchLoading && searchResults.length === 0
    : loadingCategories && categories.length === 0;
  const loadingMore = isSearchMode ? searchLoadingMore : loadingMoreCategories;
  const hasMore = isSearchMode ? searchHasMore : hasMoreCategories;
  const error = isSearchMode
    ? searchError
    : categoriesError ?? openSlot?.error ?? null;

  const hasMoreCategoriesRef = useRef(hasMoreCategories);
  hasMoreCategoriesRef.current = hasMoreCategories;

  /** 滚动分页：搜索模式走搜索结果分页，否则走分类列表分页。 */
  const onListScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining > SCROLL_LOAD_THRESHOLD_PX) return;
      if (isSearchMode) {
        void loadMoreSearch();
      } else if (hasMoreCategoriesRef.current) {
        void loadMoreCategories();
      }
    },
    [isSearchMode, loadMoreSearch, loadMoreCategories]
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [uploading, setUploading] = useState(false);

  // 分类编辑状态
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  /** 列表滚动容器；展开分类后需要把该分类滚动到可视区域顶部。 */
  const listScrollRef = useRef<HTMLDivElement>(null);
  /** 标记下一次展开后需要把该分类滚动到可视区域顶部。 */
  const pendingScrollKeyRef = useRef<string | null>(null);

  /** 展开分类时拉取该分类下全部模型。 */
  useEffect(() => {
    if (openCategoryKey) {
      ensureLoaded(openCategoryKey);
    }
  }, [openCategoryKey, ensureLoaded]);

  const allLoadedModels = getAllLoadedModels();
  // 搜索模式用服务端分页结果；非搜索模式用手风琴已加载模型
  const displayModels = isSearchMode ? searchResults : allLoadedModels;
  const hasAnyModels = categories.some((c) => c.model_count > 0);

  const {
    selectMode,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    toggleSelectMode,
    exitSelectMode,
  } = useBulkSelection(displayModels, (m) => m.model_id);

  /** 移动模型（支持批量）到指定分类。 */
  const onMoveModels = async (modelIds: string[], categoryId: string) => {
    const loaded = getAllLoadedModels();
    let succeeded = 0;
    for (const id of modelIds) {
      try {
        const updated = await updateModel3d(id, { category: categoryId });
        const existing = loaded.find((m) => m.model_id === id);
        if (existing) {
          moveModelToCategory(updated, existing.category_id);
        } else {
          upsertModel(updated);
        }
        succeeded++;
      } catch {
        // continue
      }
    }
    await refreshCategories();
    if (succeeded === modelIds.length) {
      void message.success(t.moveSuccess);
    } else if (succeeded > 0) {
      void message.error(t.moveFailed);
    } else {
      void message.error(t.moveFailed);
    }
  };

  /** 打开分类选择弹窗（支持单模型/多模型移动）。 */
  const openMoveDialog = async (modelIds: string[]) => {
    const targetCategories = categories.filter(
      (c) => !modelIds.every((id) => {
        const m = getAllLoadedModels().find((mm) => mm.model_id === id);
        return m && m.category_id === c.category_id;
      })
    );
    if (targetCategories.length === 0) return;

    const result = await dialog.custom({
      title: t.moveToCategory,
      confirmText: appMessages[locale].common.confirm,
      renderBody: (ctx) => (
        <CategoryPicker
          categories={targetCategories}
          onSelect={(categoryId) => {
            ctx.close(categoryId);
          }}
        />
      ),
    });

    if (typeof result === 'string') {
      await onMoveModels(modelIds, result);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshAll = useCallback(async () => {
    await refreshCategories();
    clearCategoryModels();
    if (openCategoryKey) {
      await refreshCategory(openCategoryKey);
    }
  }, [refreshCategories, clearCategoryModels, refreshCategory, openCategoryKey]);

  const refreshOnActivate = useCallback(async () => {
    await refreshCategories();
  }, [refreshCategories]);

  useFetchOnFirstActive(isActive, refreshOnActivate);

  // ---- 分类 CRUD ----

  /** 创建分类。 */
  const onCreateCategory = async () => {
    const name = newCatName.trim();
    if (!name) {
      setCreatingCat(false);
      return;
    }
    if (name.length > CATEGORY_NAME_MAX_LENGTH) {
      void message.warning(t.categoryNameTooLong);
      return;
    }
    try {
      await createModel3dCategory(name);
      setCreatingCat(false);
      setNewCatName('');
      await refreshCategories();
      void message.success(t.renameCategorySuccess);
    } catch (err) {
      const msg = getApiErrorMessage(err, t.renameCategoryFailed);
      if (msg.includes('已存在') || msg.includes('already')) {
        void message.error(t.categoryAlreadyExists);
      } else {
        void message.error(msg);
      }
    }
  };

  /** 开始重命名分类。 */
  const startRenameCategory = (cat: Model3dCategory) => {
    setEditingCatId(cat.category_id);
    setEditCatName(cat.name);
  };

  /** 提交重命名分类。 */
  const commitRenameCategory = async () => {
    if (!editingCatId || !editCatName.trim()) {
      setEditingCatId(null);
      return;
    }
    if (editCatName.trim().length > CATEGORY_NAME_MAX_LENGTH) {
      void message.warning(t.categoryNameTooLong);
      setEditingCatId(null);
      return;
    }
    try {
      await updateModel3dCategory(editingCatId, { name: editCatName.trim() });
      await refreshCategories();
      if (openCategoryKey) {
        await refreshCategory(openCategoryKey);
      }
      void message.success(t.renameCategorySuccess);
    } catch (err) {
      const msg = getApiErrorMessage(err, t.renameCategoryFailed);
      if (msg.includes('已存在') || msg.includes('already')) {
        void message.error(t.categoryAlreadyExists);
      } else {
        void message.error(msg);
      }
    } finally {
      setEditingCatId(null);
    }
  };

  /** 删除分类。 */
  const onDeleteCategory = async (cat: Model3dCategory) => {
    if (cat.model_count > 0) {
      void message.warning(t.categoryHasModels);
      return;
    }
    const confirmed = await dialog.confirm({
      title: t.deleteCategoryTitle,
      content: `${t.deleteCategoryPrefix}${cat.name}${t.deleteCategorySuffix}`,
      danger: true,
      confirmText: appMessages[locale].userAssets.deleteScene,
    });
    if (!confirmed) return;
    try {
      await deleteModel3dCategory(cat.category_id);
      await refreshCategories();
    } catch (err) {
      const msg = getApiErrorMessage(err, t.deleteCategoryFailed);
      if (msg.includes('模型') || msg.includes('model')) {
        void message.error(t.categoryHasModels);
      } else {
        void message.error(msg);
      }
    }
  };

  // ---- 模型操作 ----

  /** 上传模型（支持多选），并发上传 + 每文件独立进度消息。 */
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = '';

    // 没有分类时自动创建默认分类
    if (categories.length === 0) {
      try {
        await createModel3dCategory('默认模型');
        await refreshCategories();
      } catch {
        // 静默处理
      }
    }

    setUploading(true);

    await Promise.allSettled(
      files.map(async (file) => {
        const fileName = file.name;
        const loadingHandle = message.loading(`${fileName} — ${t.uploading} 0%`);
        loadingHandle.update({ progress: 0 });

        try {
          // 阶段 1：上传
          let uploadResult: Model3dMeta | null = null;
          const isZip = fileName.toLowerCase().endsWith('.zip');

          if (isZip) {
            const result = await uploadModel3dWithProgress(
              { name: fileName, file },
              (percent) => {
                loadingHandle.update({
                  text: percent >= 100
                    ? `${fileName} — 处理中...`
                    : `${fileName} — ${t.uploading} ${percent}%`,
                  progress: percent,
                });
              },
            );
            uploadResult = result;
            // 从服务端返回的 file_url 生成缩略图
            if (result.file_url) {
              loadingHandle.update({ text: `${fileName} — 生成缩略图...` });
              const thumb = await generateModel3dThumbnailFromUrl(result.file_url);
              if (thumb) {
                try { await updateModel3dThumbnail(result.model_id, thumb); } catch { /* ignore */ }
              }
            }
          } else {
            const thumbnail = await generateModel3dThumbnail(file);
            const result = await uploadModel3dWithProgress(
              { name: fileName, file, thumbnail: thumbnail ?? undefined },
              (percent) => {
                loadingHandle.update({
                  text: percent >= 100
                    ? `${fileName} — 处理中...`
                    : `${fileName} — ${t.uploading} ${percent}%`,
                  progress: percent,
                });
              },
            );
            uploadResult = result;
          }

          // 阶段 2：轮询压缩进度
          if (uploadResult) {
            loadingHandle.update({
              text: `${fileName} — 等待压缩...`,
              progress: 0,
            });

            const finalStatus = await watchCompressionProgress(
              uploadResult.model_id,
              (progress: CompressionProgress) => {
                if (progress.status === 'processing') {
                  const stageText = _getStageText(progress, t);
                  const pct = progress.percent ?? 0;
                  loadingHandle.update({
                    text: `${fileName} — ${stageText}`,
                    progress: pct,
                  });
                }
              },
            );

            if (finalStatus.status === 'failed') {
              loadingHandle.hide();
              void message.warning(`${fileName} 压缩失败，原始文件仍可使用`);
              return;
            }
          }

          loadingHandle.hide();
          void message.success(`${fileName} ${t.uploadSuccess}`);
        } catch (err) {
          loadingHandle.hide();
          void message.error(`${fileName} ${getApiErrorMessage(err, t.uploadFailed)}`);
        }
      }),
    );

    await refreshAll();
    setUploading(false);
  };

  /** 开始重命名模型。 */
  const startRename = (model: Model3dMeta) => {
    setEditingId(model.model_id);
    setEditName(model.name);
  };

  /** 提交重命名模型。 */
  const commitRename = async () => {
    if (!editingId || !editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      const updated = await updateModel3d(editingId, { name: editName.trim() });
      upsertModel(updated);
      void message.success(t.renameSuccess);
    } catch (err) {
      void message.error(`${t.renameFailedPrefix}${getApiErrorMessage(err, '')}`);
    } finally {
      setEditingId(null);
    }
  };

  /** 批量删除。 */
  const onBatchDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    const confirmed = await dialog.confirm({
      title: appMessages[locale].userAssets.deleteConfirmTitle,
      content: `${t.deleteConfirmPrefix}${count}${t.deleteConfirmSuffix}`,
      danger: true,
      confirmText: appMessages[locale].userAssets.deleteScene,
    });
    if (!confirmed) return;

    const results = await Promise.allSettled(
      Array.from(selectedIds).map((id) => deleteModel3d(id)),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;

    removeModels(selectedIds);
    exitSelectMode();
    await refreshCategories();
    if (openCategoryKey) {
      await refreshCategory(openCategoryKey);
    }

    if (succeeded === count) {
      void message.success(t.deleteSuccess);
    } else {
      void message.error(`${count - succeeded} ${t.deleteFailedPrefix}`);
    }
  };

  const USER_MODEL_DRAG_MIME = DATA_TRANSFER_KEYS.USER_MODEL_MIME;

  /** 渲染单个模型卡片。 */
  const renderCard = (model: Model3dMeta) => {
    const name = model.name || appMessages[locale].userAssets.noName;
    const isEditing = editingId === model.model_id;
    const isSelected = selectedIds.has(model.model_id);
    const canDrag = !selectMode && (!!model.file_url || !!model.compressed_file_url);

    return (
      <div
        key={model.model_id}
        className={`rounded-md border overflow-hidden ${isSelected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'}`}
        onClick={() => { if (selectMode) toggleSelect(model.model_id); }}
      >
        {/* 缩略图区域（正方形，支持拖拽到场景） */}
        <div
          draggable={canDrag}
          onDragStart={(e) => {
            // 优先使用压缩文件 URL
            const url = model.compressed_file_url || model.file_url;
            e.dataTransfer.setData(USER_MODEL_DRAG_MIME, JSON.stringify({ url, name: model.name }));
            e.dataTransfer.effectAllowed = 'copy';
          }}
          className="relative w-full bg-[var(--bg-base)] cursor-pointer"
          style={{ paddingTop: '100%' }}
          onClick={(e) => {
            if (selectMode) {
              e.stopPropagation();
              toggleSelect(model.model_id);
              return;
            }
            const src = model.thumbnail_url;
            if (src) openPreview(src, name);
          }}
        >
          {model.thumbnail_url ? (
            <img
              src={model.thumbnail_url}
              alt={name}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)] text-xs">
              {t.noThumbnail}
            </div>
          )}
          {selectMode && (
            <div
              className={`absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-strong)] bg-[var(--bg-elevated)]/80'}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(model.model_id);
              }}
            >
              {isSelected && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          )}
        </div>

        {/* 信息区域 */}
        <div className="p-1.5">
          {/* 名称（双击可编辑） */}
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => { void commitRename(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { void commitRename(); }
                if (e.key === 'Escape') setEditingId(null);
              }}
              placeholder={t.renamePlaceholder}
              className="w-full rounded border border-[var(--accent)] bg-[var(--bg-input)] px-1 py-0.5 text-xs text-[var(--text-primary)] outline-none"
              autoFocus
            />
          ) : (
            <Tooltip content={name} triggerClassName="w-full min-w-0">
              <div
                className="truncate text-xs font-medium text-[var(--text-primary)] leading-tight cursor-text"
                onDoubleClick={() => startRename(model)}
              >
                {name}
              </div>
            </Tooltip>
          )}

          {/* 大小 */}
          <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            {model.compressed_file_size > 0 && model.compression_status === 'completed'
              ? `${formatSize(model.compressed_file_size)}`
              : formatSize(model.file_size)}
          </div>
        </div>
      </div>
    );
  };

  /** 渲染分类 Accordion header。 */
  const renderCategoryHeader = (cat: Model3dCategory) => {
    if (editingCatId === cat.category_id) {
      return (
        <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={editCatName}
            onChange={(e) => setEditCatName(e.target.value)}
            onBlur={() => { void commitRenameCategory(); }}
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { void commitRenameCategory(); }
              if (e.key === 'Escape') setEditingCatId(null);
            }}
            placeholder={t.createCategoryPlaceholder}
            className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--bg-input)] px-1 py-0.5 text-xs text-[var(--text-primary)] outline-none"
            autoFocus
          />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 w-full min-w-0 group/header">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
          {cat.name}
        </span>
        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
          {cat.model_count}
        </span>
        {/* 操作图标：hover 时显示 */}
        <div className="hidden group-hover/header:flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => startRenameCategory(cat)}
            className="flex h-4 w-4 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--accent)]"
            title={t.renameCategoryLabel}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M8.24 1.76a.6.6 0 0 1 .85 0 .6.6 0 0 1 0 .85L3.35 8.35 1.5 9l.65-1.85 6.09-5.39z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => { void onDeleteCategory(cat); }}
            className="flex h-4 w-4 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--color-error,#ef4444)]"
            title={appMessages[locale].userAssets.deleteScene}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  /** 渲染顶栏。 */
  const renderToolbar = () => (
    <div className="flex shrink-0 flex-col gap-1 px-2 py-1.5">
      {/* Row 1: Search + Create + Upload + Refresh */}
      <div className="flex items-center gap-1.5">
        {creatingCat ? (
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onBlur={() => { void onCreateCategory(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { void onCreateCategory(); }
                if (e.key === 'Escape') { setCreatingCat(false); setNewCatName(''); }
              }}
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              placeholder={t.createCategoryPlaceholder}
              className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none"
              autoFocus
            />
          </div>
        ) : (
          <>
            {/* 搜索输入框 */}
            <div className="relative min-w-0 flex-1">
              <svg
                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)] pointer-events-none"
                width="12" height="12" viewBox="0 0 12 12" fill="none"
              >
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M8 8l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-input)] pl-5 pr-1.5 py-0.5 text-[10px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>
            <button
              type="button"
              onClick={() => setCreatingCat(true)}
              className={btnBase + ' text-[var(--text-secondary)] shrink-0'}
            >
              + {t.createCategoryLabel}
            </button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={MODEL_ACCEPT}
          multiple
          onChange={(e) => { void onUpload(e); }}
          className="hidden"
        />
        <Tooltip
          content={t.uploadSupportedFormatsTooltip}
          disabled={uploading}
          placement="bottom"
          triggerClassName="shrink-0"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label={t.uploadLabel}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 10V2M3 5l3-3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </Tooltip>
        <button
          type="button"
          onClick={() => { void refreshAll(); }}
          disabled={loading || loadingMore}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          title={appMessages[locale].userAssets.refresh}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 6a5 5 0 0 1 9.3-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M11 6a5 5 0 0 1-9.3 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M10 1v3h-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 11V8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {/* Row 2: 选择模式按钮 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {hasAnyModels && (
        <button
          type="button"
          onClick={toggleSelectMode}
          className={btnBase + (selectMode ? ' border-[var(--accent)] text-[var(--accent-strong)]' : ' text-[var(--text-secondary)]')}
        >
          {selectMode ? t.selectModeActive : t.selectLabel}
        </button>
        )}
        {selectMode && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className={btnBase + ' text-[var(--text-secondary)]'}
          >
            {selectedIds.size === displayModels.length && displayModels.length > 0 ? t.deselectAllLabel : t.selectAllLabel}
          </button>
        )}
        {selectMode && selectedIds.size > 0 && categories.length > 1 && (
          <button
            type="button"
            onClick={() => { void openMoveDialog(Array.from(selectedIds)); }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--accent)]"
            title={`${t.moveToCategory} (${selectedIds.size})`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6h5M5 4l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 2v8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {selectMode && selectedIds.size > 0 && (
          <button
            type="button"
            onClick={() => { void onBatchDelete(); }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--color-error,#ef4444)]"
            title={`${t.batchDeleteLabel} (${selectedIds.size})`}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  // 默认展开第一个分类（仅初次加载时设置，用户关闭后不会自动重新展开）
  const initialOpenSetRef = useRef(false);
  useEffect(() => {
    if (categories.length === 0) {
      initialOpenSetRef.current = false;
      if (openCategoryKey !== null) setOpenCategoryKey(null);
      return;
    }
    if (initialOpenSetRef.current) return;
    initialOpenSetRef.current = true;
    setOpenCategoryKey(categories[0].category_id);
  }, [categories, openCategoryKey]);

  // 展开切换后，等 Accordion 过渡完成再滚动到新展开的分类
  useEffect(() => {
    const key = pendingScrollKeyRef.current;
    if (!key) return;
    if (openCategoryKey !== key) return;

    pendingScrollKeyRef.current = null;
    // Accordion max-height 过渡 180ms，等过渡完成后再滚动
    const timer = setTimeout(() => {
      const container = listScrollRef.current;
      const header = container?.querySelector<HTMLElement>(`#accordion-header-${CSS.escape(key)}`);
      const target = header?.parentElement as HTMLElement | null;
      if (!container || !target) return;
      const top = target.offsetTop - container.offsetTop;
      container.scrollTo({ top, behavior: 'smooth' });
    }, 200);
    return () => clearTimeout(timer);
  }, [openCategoryKey]);

  const onCategoryOpenChange = (next: string[]) => {
    const nextKey = next[0] ?? null;
    // 仅当展开了一个新的分类（不是收起当前的）时滚动
    if (nextKey && nextKey !== openCategoryKey) {
      pendingScrollKeyRef.current = nextKey;
    }
    setOpenCategoryKey(nextKey);
  };

  // ——— 状态渲染 ———

  if (loading && categories.length === 0 && !hasAnyModels) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
        {appMessages[locale].common.loading}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-[var(--text-muted)]">
        <span className="text-[var(--color-error,#ef4444)]">{error || t.loadFailed}</span>
        <button
          type="button"
          onClick={() => { void refreshAll(); }}
          className={btnBase + ' text-[var(--text-secondary)]'}
        >
          {appMessages[locale].userAssets.refresh}
        </button>
      </div>
    );
  }

  if (!hasAnyModels && categories.length === 0) {
    return (
      <div className="flex h-full flex-col gap-3">
        {renderToolbar()}
        <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            {t.emptyNoData}
          </div>
        </div>
      </div>
    );
  }

  /** 渲染某分类下的模型区域（展开后按 category id 拉全量）。 */
  const renderCategoryBody = (cat: Model3dCategory) => {
    const slot = getSlot(cat.category_id);
    const items = slot.items;

    if (slot.loading && items.length === 0) {
      return (
        <div className="py-4 text-center text-xs text-[var(--text-muted)]">
          {appMessages[locale].common.loading}
        </div>
      );
    }
    if (items.length > 0) {
      return (
        <div className="grid grid-cols-2 gap-2">
          {items.map(renderCard)}
        </div>
      );
    }
    return (
      <div className="py-4 text-center text-xs text-[var(--text-muted)]">
        {t.emptyCategory}
      </div>
    );
  };

  // 搜索模式：扁平网格列表
  const renderSearchResults = () => {
    if (searchLoading && searchResults.length === 0) {
      return (
        <div className="py-8 text-center text-xs text-[var(--text-muted)]">
          {appMessages[locale].common.loading}
        </div>
      );
    }
    if (searchResults.length === 0) {
      return (
        <div className="py-8 text-center text-xs text-[var(--text-muted)]">
          {t.emptyNoData}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-2">
        {searchResults.map(renderCard)}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col min-h-0">
      {renderToolbar()}

      <div
        ref={listScrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-2 pb-2"
        onScroll={onListScroll}
      >
        {isSearchMode ? (
          renderSearchResults()
        ) : categories.length > 0 ? (
          <Accordion
            openKeys={openCategoryKey ?? []}
            onOpenKeysChange={onCategoryOpenChange}
            items={categories.map((cat) => ({
              key: cat.category_id,
              header: renderCategoryHeader(cat),
              content: renderCategoryBody(cat),
            }))}
            itemClassName="[&]:scroll-mt-0"
          />
        ) : (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            {t.emptyNoData}
          </div>
        )}
        <ListScrollFooter loading={loading} loadingMore={loadingMore} hasMore={hasMore} />
      </div>
    </div>
  );
}
