/**
 * 贴图资源面板：展示并管理用户上传的贴图资源。
 *
 * 功能：
 * - 首次进入 Tab 时自动拉取当前用户的贴图列表（全量，分类在本地筛选）
 * - 按分类筛选（8 种贴图类型），可切回"全部"
 * - 全部分类时按 Accordion 分组展示，单一分类时扁平列表
 * - 点击缩略图预览（复用 ImagePreviewContext）
 * - 双击名称可重命名（inline 编辑）
 * - 选中分类后显示上传按钮，上传贴图归入当前分类
 * - 材质面板上传贴图时自动同步到此处
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFetchOnFirstActive } from '../../../../hooks/useFetchOnFirstActive';

import { Accordion } from '../../../../components/Accordion';
import { Tooltip } from '../../../../components/Tooltip';
import { dialog } from '../../../../components/GlobalDialog';
import { message } from '../../../../components/GlobalMessage';
import { useImagePreview } from '../../../../components/ImagePreviewContext';
import { Select, type SelectOption } from '../../../../components/Select';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import {
  type TextureCategory,
  type TextureMeta,
  deleteTexture,
  listTextures,
  updateTexture,
  uploadTextureWithProgress,
} from '../../../../api/textures';
import { getApiErrorMessage, mergeUploadErrorMessages } from '../../../../utils/apiError';
import {
  getTextureCategoryUploadConfig,
  type TextureUploadFormatHintKey,
} from '../../../../utils/textureCategoryUpload';
import { generateThumbnail } from '../../../../utils/textureThumbnail';

/** 分类 key 类型，含 '' 表示"全部"。 */
type CategoryFilter = TextureCategory | '';

/** 将字节数格式化为人类可读的文件大小字符串。 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 按钮通用样式。 */
const btnBase =
  'rounded border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40';

const UPLOAD_FORMAT_HINT_I18N: Record<
  TextureUploadFormatHintKey,
  'uploadFormatHintColor' | 'uploadFormatHintData' | 'uploadFormatHintHdri' | 'uploadFormatHintAll'
> = {
  color: 'uploadFormatHintColor',
  data: 'uploadFormatHintData',
  hdri: 'uploadFormatHintHdri',
  all: 'uploadFormatHintAll',
};

/**
 * 贴图资源面板。
 */
export function TexturePanel({ isActive }: { isActive: boolean }) {
  const { locale } = useLocale();
  const t = appMessages[locale].userAssets.textureLibrary;
  const { openPreview } = useImagePreview();

  const [textures, setTextures] = useState<TextureMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 受控 Accordion 展开的分类 key（单选，默认第一个）
  const [openCatKey, setOpenCatKey] = useState<TextureCategory | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollKeyRef = useRef<TextureCategory | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 分类筛选选项（"全部"作为可选项，非 placeholder）。 */
  const categoryOptions: SelectOption<CategoryFilter>[] = [
    { value: '', label: t.categoryAll },
    { value: 'color_map', label: t.categoryColorMap },
    { value: 'environment_map', label: t.categoryEnvironmentMap },
    { value: 'opacity_map', label: t.categoryOpacityMap },
    { value: 'lighting_map', label: t.categoryLightingMap },
    { value: 'normal_map', label: t.categoryNormalMap },
    { value: 'pbr_map', label: t.categoryPbrMap },
    { value: 'physical_map', label: t.categoryPhysicalMap },
    { value: 'scene_environment', label: t.categorySceneEnvironment },
  ];

  /** 分类 key → 中文标签的映射。 */
  const categoryLabelMap: Record<TextureCategory, string> = {
    color_map: t.categoryColorMap,
    environment_map: t.categoryEnvironmentMap,
    opacity_map: t.categoryOpacityMap,
    lighting_map: t.categoryLightingMap,
    normal_map: t.categoryNormalMap,
    pbr_map: t.categoryPbrMap,
    physical_map: t.categoryPhysicalMap,
    scene_environment: t.categorySceneEnvironment,
  };

  const changeCategoryFilter = (v: CategoryFilter) => {
    setCategoryFilter(v);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  /** 当前选中分类对应的上传 accept 与 Tooltip 文案。 */
  const categoryUploadConfig = useMemo(
    () => (categoryFilter ? getTextureCategoryUploadConfig(categoryFilter) : null),
    [categoryFilter]
  );

  const uploadFormatsTooltip = useMemo(() => {
    if (!categoryUploadConfig) return '';
    const hintKey = UPLOAD_FORMAT_HINT_I18N[categoryUploadConfig.hintKey];
    return `${t.uploadSupportedFormatsPrefix}${t[hintKey]}`;
  }, [categoryUploadConfig, t]);

  /** 拉取贴图列表（全量；分类筛选在本地完成）。 */
  const fetchTextures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTextures();
      setTextures(data);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw || t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [t.loadFailed]);

  useFetchOnFirstActive(isActive, fetchTextures);

  /** 按当前分类筛选后的展示列表。 */
  const displayTextures = useMemo(
    () => (categoryFilter ? textures.filter((tex) => tex.category === categoryFilter) : textures),
    [textures, categoryFilter]
  );

  // 列表为空时退出选择模式，避免隐藏按钮后状态残留
  useEffect(() => {
    if (displayTextures.length === 0 && selectMode) {
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  }, [displayTextures.length, selectMode]);

  /** 上传贴图（需先选中分类，支持多选）。 */
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !categoryFilter) return;
    e.target.value = '';

    setUploading(true);
    const total = files.length;
    const loadingHandle = message.loading(`${t.uploading} (1/${total}) 0%`);
    loadingHandle.update({ progress: 0 });

    const failedMessages: string[] = [];

    for (let i = 0; i < total; i++) {
      const file = files[i];
      const baseProgress = (i / total) * 100;
      try {
        loadingHandle.update({ text: `${t.uploadProcessing} (${i + 1}/${total})`, progress: baseProgress });
        const thumbnail = await generateThumbnail(file);

        await uploadTextureWithProgress(
          {
            name: file.name,
            file,
            thumbnail: thumbnail ?? undefined,
            category: categoryFilter,
          },
          (percent) => {
            const overall = baseProgress + (percent / total);
            if (percent >= 100) {
              loadingHandle.update({ text: `${t.uploadProcessing} (${i + 1}/${total})`, progress: Math.min(overall, 100) });
            } else {
              loadingHandle.update({ text: `${t.uploading} (${i + 1}/${total}) ${percent}%`, progress: overall });
            }
          }
        );
      } catch (err) {
        failedMessages.push(getApiErrorMessage(err, t.uploadFailed));
      }
    }

    await fetchTextures();
    loadingHandle.hide();

    if (failedMessages.length === 0) {
      void message.success(t.uploadSuccess);
    } else {
      void message.error(`${t.uploadFailedPrefix}${mergeUploadErrorMessages(failedMessages)}`);
    }
    setUploading(false);
  };

  /** 开始重命名。 */
  const startRename = (tex: TextureMeta) => {
    setEditingId(tex.texture_id);
    setEditName(tex.name);
  };

  /** 提交重命名。 */
  const commitRename = async () => {
    if (!editingId || !editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      const updated = await updateTexture(editingId, { name: editName.trim() });
      setTextures((prev) => prev.map((t2) => (t2.texture_id === editingId ? updated : t2)));
      void message.success(t.renameSuccess);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      void message.error(`${t.renameFailedPrefix}${raw}`);
    } finally {
      setEditingId(null);
    }
  };

  const toggleSelectMode = () => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === displayTextures.length) return new Set();
      return new Set(displayTextures.map((t2) => t2.texture_id));
    });
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

    let succeeded = 0;
    for (const id of selectedIds) {
      try {
        await deleteTexture(id);
        succeeded++;
      } catch {
        // continue deleting the rest
      }
    }

    setTextures((prev) => prev.filter((t2) => !selectedIds.has(t2.texture_id)));
    setSelectedIds(new Set());
    setSelectMode(false);

    if (succeeded === count) {
      void message.success(t.deleteSuccess);
    } else {
      void message.error(`${count - succeeded}${t.deleteFailedPrefix.slice(-3)}`);
    }
  };

  /** 渲染单个贴图卡片。 */
  const renderCard = (tex: TextureMeta) => {
    const name = tex.name || appMessages[locale].userAssets.noName;
    const isEditing = editingId === tex.texture_id;
    const isSelected = selectedIds.has(tex.texture_id);

    return (
      <div
        key={tex.texture_id}
        className={`rounded-md border overflow-hidden ${isSelected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'}`}
        onClick={() => { if (selectMode) toggleSelect(tex.texture_id); }}
      >
        {/* 缩略图区域（正方形） */}
        <button
          type="button"
          className="relative w-full bg-[var(--bg-base)] cursor-pointer"
          style={{ paddingTop: '100%' }}
          onClick={(e) => {
            if (selectMode) {
              e.stopPropagation();
              toggleSelect(tex.texture_id);
              return;
            }
            const src = tex.thumbnail_url || tex.file_url;
            if (src) openPreview(src, name);
          }}
        >
          {tex.thumbnail_url ? (
            <img
              src={tex.thumbnail_url}
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
                toggleSelect(tex.texture_id);
              }}
            >
              {isSelected && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          )}
        </button>

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
                onDoubleClick={() => startRename(tex)}
              >
                {name}
              </div>
            </Tooltip>
          )}

          {/* 分类 + 大小 */}
          <div className="mt-0.5 text-[10px] text-[var(--text-muted)] flex items-center justify-between">
            <Tooltip content={categoryLabelMap[tex.category]} triggerClassName="min-w-0">
              <span className="truncate">{categoryLabelMap[tex.category]}</span>
            </Tooltip>
            <span className="ml-1 shrink-0">{formatSize(tex.file_size)}</span>
          </div>
        </div>
      </div>
    );
  };

  /** 渲染顶栏（分类筛选 + 条件上传 + 批量选择 + 刷新）。 */
  const renderToolbar = () => (
    <div className="flex shrink-0 flex-col gap-1 px-2 py-1.5">
      {/* Row 1: 分类筛选 + 上传 + 刷新 */}
      <div className="flex items-center gap-1.5">
        <Select<CategoryFilter>
          value={categoryFilter}
          onChange={changeCategoryFilter}
          options={categoryOptions}
          className="min-w-0 flex-1 text-xs"
        />
        {categoryFilter && (
          <>
            <input
              key={categoryFilter}
              ref={fileInputRef}
              type="file"
              accept={categoryUploadConfig?.accept}
              multiple
              onChange={(e) => { void onUpload(e); }}
              className="hidden"
            />
            <Tooltip
              content={uploadFormatsTooltip}
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
          </>
        )}
        <button
          type="button"
          onClick={() => { void fetchTextures(); }}
          disabled={loading}
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
      {/* Row 2: 操作按钮（选择相关，无贴图时隐藏） */}
      {displayTextures.length > 0 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleSelectMode}
            className={btnBase + (selectMode ? ' border-[var(--accent)] text-[var(--accent-strong)]' : ' text-[var(--text-secondary)]')}
          >
            {selectMode ? t.selectModeActive : t.selectLabel}
          </button>
          {selectMode && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className={btnBase + ' text-[var(--text-secondary)]'}
            >
              {selectedIds.size === displayTextures.length ? t.deselectAllLabel : t.selectAllLabel}
            </button>
          )}
          {selectMode && selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => { void onBatchDelete(); }}
              className={btnBase + ' text-[var(--color-error,#ef4444)]'}
            >
              {`${t.batchDeleteLabel} (${selectedIds.size})`}
            </button>
          )}
        </div>
      )}
    </div>
  );

  // 按分类分组
  const grouped = categoryFilter
    ? null
    : Object.entries(
        displayTextures.reduce<Record<string, TextureMeta[]>>((acc, tex) => {
          const cat = tex.category;
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(tex);
          return acc;
        }, {})
      );

  // 默认展开第一个分类（仅初次加载时设置，用户关闭后不会自动重新展开）
  const initialOpenSetRef = useRef(false);
  useEffect(() => {
    if (!grouped || grouped.length === 0) {
      initialOpenSetRef.current = false;
      if (openCatKey !== null) setOpenCatKey(null);
      return;
    }
    if (initialOpenSetRef.current) return;
    initialOpenSetRef.current = true;
    setOpenCatKey(grouped[0][0] as TextureCategory);
  }, [grouped, openCatKey]);

  // 展开切换后，等 Accordion 过渡完成再滚动到新展开的分类
  useEffect(() => {
    const key = pendingScrollKeyRef.current;
    if (!key || openCatKey !== key) return;

    pendingScrollKeyRef.current = null;
    const timer = setTimeout(() => {
      const container = listScrollRef.current;
      const header = container?.querySelector<HTMLElement>(`#accordion-header-${CSS.escape(key)}`);
      const target = header?.parentElement as HTMLElement | null;
      if (!container || !target) return;
      const top = target.offsetTop - container.offsetTop;
      container.scrollTo({ top, behavior: 'smooth' });
    }, 200);
    return () => clearTimeout(timer);
  }, [openCatKey]);

  const onCatOpenChange = (next: string[]) => {
    const nextKey = (next[0] ?? null) as TextureCategory | null;
    if (nextKey && nextKey !== openCatKey) {
      pendingScrollKeyRef.current = nextKey;
    }
    setOpenCatKey(nextKey);
  };

  // ——— 状态渲染 ———

  if (loading && textures.length === 0) {
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
          onClick={() => { void fetchTextures(); }}
          className={btnBase + ' text-[var(--text-secondary)]'}
        >
          {appMessages[locale].userAssets.refresh}
        </button>
      </div>
    );
  }

  if (textures.length === 0 && !categoryFilter) {
    return (
      <div className="flex h-full flex-col gap-3">
        {renderToolbar()}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">{t.emptyTextures}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      {renderToolbar()}

      {/* 贴图列表 */}
      <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {grouped ? (
          // 全部分类 → Accordion 分组
          <Accordion<TextureCategory>
            openKeys={openCatKey ?? []}
            onOpenKeysChange={onCatOpenChange}
            items={grouped.map(([cat, items]) => ({
              key: cat as TextureCategory,
              header: `${categoryLabelMap[cat as TextureCategory]} (${items.length})`,
              content: (
                <div className="grid grid-cols-2 gap-2">
                  {items.map(renderCard)}
                </div>
              ),
            }))}
          />
        ) : (
          // 单一分类 → 扁平列表
          <div className="grid grid-cols-2 gap-2">
            {displayTextures.map(renderCard)}
          </div>
        )}

        {displayTextures.length === 0 && categoryFilter && (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            {t.emptyTextures}
          </div>
        )}
      </div>
    </div>
  );
}
