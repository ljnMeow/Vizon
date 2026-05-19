/**
 * 贴图资源面板：展示并管理用户上传的贴图资源。
 *
 * 功能：
 * - 挂载时自动拉取当前用户的贴图列表
 * - 按分类筛选（8 种贴图类型），可切回"全部"
 * - 全部分类时按 Accordion 分组展示，单一分类时扁平列表
 * - 点击缩略图预览（复用 ImagePreviewContext）
 * - 双击名称可重命名（inline 编辑）
 * - 选中分类后显示上传按钮，上传贴图归入当前分类
 * - 材质面板上传贴图时自动同步到此处
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Accordion } from '../../../../components/Accordion';
import { dialog } from '../../../../components/GlobalDialog';
import { message } from '../../../../components/GlobalMessage';
import { useImagePreview } from '../../../../components/ImagePreviewContext';
import { Select, type SelectOption } from '../../../../components/Select';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import {
  type TextureCategory,
  type TextureMeta,
  createTexture,
  deleteTexture,
  listTextures,
  updateTexture,
} from '../../../../api/textures';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [uploading, setUploading] = useState(false);

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

  /** 拉取贴图列表。 */
  const fetchTextures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTextures(categoryFilter || undefined);
      setTextures(data);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw || t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, t.loadFailed]);

  // Tab 激活或分类筛选变化时加载列表
  useEffect(() => {
    if (!isActive) return;
    void fetchTextures();
  }, [isActive, fetchTextures]);

  /** 上传贴图（需先选中分类）。 */
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !categoryFilter) return;
    e.target.value = '';

    setUploading(true);
    try {
      const thumbnail = await generateThumbnail(file);
      await createTexture({
        name: file.name,
        file,
        thumbnail: thumbnail ?? undefined,
        category: categoryFilter,
      });
      void message.success(t.renameSuccess);
      await fetchTextures();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      void message.error(`${t.renameFailedPrefix}${raw}`);
    } finally {
      setUploading(false);
    }
  };

  /** 删除贴图。 */
  const onDelete = async (tex: TextureMeta) => {
    const name = tex.name || appMessages[locale].userAssets.noName;
    const confirmed = await dialog.confirm({
      title: appMessages[locale].userAssets.deleteConfirmTitle,
      content: `${t.deleteConfirmPrefix}${name}${t.deleteConfirmSuffix}`,
      danger: true,
      confirmText: appMessages[locale].userAssets.deleteScene,
    });
    if (!confirmed) return;
    setDeletingId(tex.texture_id);
    try {
      await deleteTexture(tex.texture_id);
      setTextures((prev) => prev.filter((t2) => t2.texture_id !== tex.texture_id));
      void message.success(t.deleteSuccess);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      void message.error(`${t.deleteFailedPrefix}${raw}`);
    } finally {
      setDeletingId(null);
    }
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

  /** 渲染单个贴图卡片。 */
  const renderCard = (tex: TextureMeta) => {
    const isBusy = deletingId === tex.texture_id;
    const name = tex.name || appMessages[locale].userAssets.noName;
    const isEditing = editingId === tex.texture_id;

    return (
      <div
        key={tex.texture_id}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
      >
        {/* 缩略图区域（正方形） */}
        <button
          type="button"
          className="relative w-full bg-[var(--bg-base)] cursor-pointer"
          style={{ paddingTop: '100%' }}
          onClick={() => {
            const src = tex.file_url || tex.thumbnail_url;
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
            <p
              className="truncate text-xs font-medium text-[var(--text-primary)] leading-tight cursor-text"
              title={name}
              onDoubleClick={() => startRename(tex)}
            >
              {name}
            </p>
          )}

          {/* 分类 + 大小 */}
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)] flex items-center justify-between">
            <span className="truncate">{categoryLabelMap[tex.category]}</span>
            <span className="ml-1 shrink-0">{formatSize(tex.file_size)}</span>
          </p>

          {/* 删除按钮 */}
          <div className="mt-1 flex items-center justify-end">
            <button
              type="button"
              onClick={() => { void onDelete(tex); }}
              disabled={isBusy}
              className={btnBase + ' text-[var(--text-secondary)] hover:text-[var(--color-error,#ef4444)]'}
            >
              {deletingId === tex.texture_id ? '...' : appMessages[locale].userAssets.deleteScene}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /** 渲染顶栏（分类筛选 + 条件上传 + 刷新）。 */
  const renderToolbar = () => (
    <div className="flex shrink-0 items-center gap-2 px-2 py-1">
      <Select<CategoryFilter>
        value={categoryFilter}
        onChange={setCategoryFilter}
        options={categoryOptions}
        className="flex-1 text-xs"
      />
      {categoryFilter && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.hdr,.exr"
            onChange={(e) => { void onUpload(e); }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={btnBase + ' text-[var(--text-secondary)]'}
          >
            {uploading ? '...' : t.uploadLabel}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => { void fetchTextures(); }}
        disabled={loading}
        className={btnBase + ' text-[var(--text-secondary)]'}
      >
        {appMessages[locale].userAssets.refresh}
      </button>
    </div>
  );

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

  // 按分类分组
  const grouped = categoryFilter
    ? null
    : Object.entries(
        textures.reduce<Record<string, TextureMeta[]>>((acc, tex) => {
          const cat = tex.category;
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(tex);
          return acc;
        }, {})
      );

  return (
    <div className="flex h-full flex-col min-h-0">
      {renderToolbar()}

      {/* 贴图列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {grouped ? (
          // 全部分类 → Accordion 分组
          <Accordion<TextureCategory>
            defaultOpenKeys={grouped.length > 0 ? grouped[0][0] as TextureCategory : undefined}
            allowMultiple
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
            {textures.map(renderCard)}
          </div>
        )}

        {textures.length === 0 && categoryFilter && (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            {t.emptyTextures}
          </div>
        )}
      </div>
    </div>
  );
}
