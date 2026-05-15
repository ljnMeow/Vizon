import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import { importDocument, VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT } from 'vizon-3d-core';
import dayjs from 'dayjs';
import { GlobalMenu } from '../../../../components/GlobalMenu';
import { message } from '../../../../components/GlobalMessage';
import { useLocale } from '../../../../hooks/useLocale';
import { useLoadedScene } from '../../../../hooks/useLoadedScene';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { useTheme } from '../../../../hooks/useTheme';
import { appMessages } from '../../../../i18n/messages';
import { createScene, updateScene } from '../../../../api/scenes';
import { buildProjectBundle, importProjectBundle } from '../../../../utils/documentBundle';
import { encodeHistoryI18nName } from '../../../../utils/historyI18n';

/**
 * 判断快捷键事件是否来自可编辑输入控件。
 * 若用户正在输入文本，则不拦截系统常见按键行为。
 */
function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

/** 将场景名整理为可安全用于下载文件名的片段（去除非法字符、控制长度）。 */
function sanitizeExportFileBaseName(raw: string) {
  const trimmed = raw.trim().replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ');
  const collapsed = trimmed.replace(/\s{2,}/g, ' ').trim();
  return collapsed.slice(0, 120);
}

/**
 * 设计器顶部操作栏。
 * 聚合撤销/重做、复制粘贴、删除、清空、重置以及语言/主题切换入口。
 */
export function ActionBar() {
  const { editor, sceneSettings } = useSceneSettings();
  const { locale, setLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const { loadedSceneId, setLoadedSceneId } = useLoadedScene();
  const [open, setOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [canPaste, setCanPaste] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [canGroup, setCanGroup] = useState(false);
  const [canUngroup, setCanUngroup] = useState(false);
  // 保存进行中时禁用按钮，防止重复提交
  const [isSaving, setIsSaving] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importBundleInputRef = useRef<HTMLInputElement | null>(null);

  const labels = useMemo(() => appMessages[locale].designPage.actionBar, [locale]);
  const loginT = appMessages[locale].auth.login;

  // 根据编辑器实时状态刷新菜单项的可用性，避免按钮状态与底层能力不一致。
  useEffect(() => {
    if (!editor) {
      setCanUndo(false);
      setCanRedo(false);
      setCanPaste(false);
      setHasSelection(false);
      setCanGroup(false);
      setCanUngroup(false);
      return;
    }
    const refresh = () => {
      setCanUndo(editor.canUndo());
      setCanRedo(editor.canRedo());
      setCanPaste(editor.canPaste());
      setHasSelection(editor.getSelectedObjects().length > 0);
      setCanGroup(editor.canGroupSelected());
      setCanUngroup(editor.canUngroupSelected());
    };
    refresh();
    const offHistory = editor.on('historyChange', refresh);
    const offSelect = editor.on('select', refresh);
    return () => {
      offHistory?.();
      offSelect?.();
    };
  }, [editor]);

  // 注册全局快捷键：仅在非输入态下代理常见编辑操作给 ThreeEditor。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editor) return;
      if (isEditableTarget(e.target)) return;
      const cmd = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (cmd && key === 'z' && e.shiftKey) {
        e.preventDefault();
        void editor.redo();
        return;
      }
      if (cmd && key === 'z') {
        e.preventDefault();
        void editor.undo();
        return;
      }
      if (cmd && key === 'c') {
        e.preventDefault();
        editor.copySelected();
        setCanPaste(editor.canPaste());
        return;
      }
      if (cmd && key === 'v') {
        e.preventDefault();
        void editor.pasteFromClipboard();
        return;
      }
      if (cmd && key === 'd') {
        e.preventDefault();
        void editor.groupSelected();
        return;
      }
      if (cmd && key === 'f') {
        e.preventDefault();
        void editor.ungroupSelected();
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        void editor.deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  // 头部操作栏沿用登录页的中英文切换策略。
  const onToggleLocale = () => {
    setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN');
  };

  const onExportScreenshot = () => {
    if (!editor) return;
    try {
      const dataUrl = editor.takeScreenshot();
      const configured = sceneSettings.basic.sceneName.trim();
      const rawBase = configured || labels.exportFileDefaultSceneName;
      const safeBase = sanitizeExportFileBaseName(rawBase) || labels.exportFileDefaultSceneName;
      const ts = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${safeBase}-${ts}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      void message.error(`${labels.exportFailedPrefix}${raw || labels.exportUnknownError}`);
    }
  };

  const onExportBundle = async () => {
    if (!editor) return;
    try {
      const { blob } = await buildProjectBundle(editor, { generator: 'apps/web-project-bundle' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const configured = sceneSettings.basic.sceneName.trim();
      const rawBase = configured || labels.exportFileDefaultSceneName;
      const safeBase = sanitizeExportFileBaseName(rawBase) || labels.exportFileDefaultSceneName;
      a.href = url;
      a.download = `${safeBase}-${ts}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      void message.error(`${labels.exportFailedPrefix}${raw || labels.exportUnknownError}`);
    }
  };

  /**
   * 保存当前场景到服务端。
   * - 若当前编辑器中已有载入的服务端场景（loadedSceneId 非 null），则覆盖更新
   * - 否则新建场景
   * 保存期间显示 loading toast（阻止交互），完成后提示成功或失败。
   */
  const onSaveScene = async () => {
    if (!editor) return;
    setIsSaving(true);
    const loadingHandle = message.loading(labels.saveSceneUploading);
    try {
      const name = sceneSettings.basic.sceneName.trim();
      const screenshotDataUrl = editor.takeScreenshot();
      const thumbnailBlob = await fetch(screenshotDataUrl).then((r) => r.blob());
      const { blob: bundleBlob } = await buildProjectBundle(editor, { generator: 'apps/web-save-scene' });

      if (loadedSceneId) {
        // 已有载入场景：覆盖更新，保持场景 ID 不变
        await updateScene(loadedSceneId, { name, bundle: bundleBlob, thumbnail: thumbnailBlob });
      } else {
        // 全新场景：新建
        const created = await createScene({ name, bundle: bundleBlob, thumbnail: thumbnailBlob });
        // 新建成功后标记为已载入，下次保存将走覆盖逻辑
        setLoadedSceneId(created.scene_id);
      }

      loadingHandle.hide();
      void message.success(labels.saveSceneSuccess);
    } catch (err) {
      loadingHandle.hide();
      const raw = err instanceof Error ? err.message : String(err);
      void message.error(`${labels.saveSceneFailedPrefix}${raw || labels.exportUnknownError}`);
    } finally {
      setIsSaving(false);
    }
  };

  const onImportBundleClick = () => {
    editor?.resetShiftMultiselectState();
    importBundleInputRef.current?.click();
  };

  const onImportDocumentChange: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const inputEl = e.currentTarget;
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const before = editor.getVizonDocument({ generator: 'apps/web-actionbar' });
      const after = JSON.parse(JSON.stringify(parsed)) as unknown;
      await editor.executeHistoryOperation({
        name: encodeHistoryI18nName({
          'zh-CN': '导入 JSON 文档',
          'en-US': 'Import JSON document'
        }),
        do: async () => {
          await importDocument(editor, after);
        },
        undo: async () => {
          await importDocument(editor, before);
        },
        redo: async () => {
          await importDocument(editor, after);
        }
      });
    } catch (err) {
      // 测试入口保持轻量：导入失败时给出最小可见反馈，便于快速定位 JSON 问题。
      const raw = err instanceof Error ? err.message : String(err);
      const msg =
        raw === VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT ? labels.importNoObjectSnapshot : raw || labels.importUnknownError;
      void message.error(`${labels.importFailedPrefix}${msg}`);
    } finally {
      // 允许重复导入同一文件（浏览器对同名同文件不会重复触发 change）。
      inputEl.value = '';
      // 解析失败等路径不会走 importDocument 内的重置；仍要恢复 Shift/Gizmo 相关状态。
      editor?.resetShiftMultiselectState();
    }
  };

  const onImportBundleChange: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const inputEl = e.currentTarget;
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const loadingHandle = message.loading(labels.importBundleLoading);
    loadingHandle.update({ progress: 0 });
    try {
      const before = editor.getVizonDocument({ generator: 'apps/web-actionbar' });
      await editor.executeHistoryOperation({
        name: encodeHistoryI18nName({
          'zh-CN': '导入项目包',
          'en-US': 'Import project bundle'
        }),
        do: async () => {
          await importProjectBundle(editor, file, (percent) => {
            loadingHandle.update({
              text: `${labels.importBundleProgress} ${percent}%`,
              progress: percent
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
    } catch (err) {
      loadingHandle.hide();
      const raw = err instanceof Error ? err.message : String(err);
      void message.error(`${labels.importFailedPrefix}${raw || labels.importUnknownError}`);
    } finally {
      inputEl.value = '';
      editor?.resetShiftMultiselectState();
    }
  };

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        {labels.title}
      </button>
      <GlobalMenu
        open={open}
        containerRef={ref}
        onRequestClose={() => setOpen(false)}
        groups={[
          {
            key: 'actions',
            itemDividers: true,
            items: [
              { key: 'undo', label: labels.undoWithShortcut, disabled: !canUndo, onClick: () => { setOpen(false); void editor?.undo(); } },
              { key: 'redo', label: labels.redoWithShortcut, disabled: !canRedo, onClick: () => { setOpen(false); void editor?.redo(); } },
              { key: 'copy', label: labels.copyWithShortcut, disabled: !hasSelection, onClick: () => { setOpen(false); editor?.copySelected(); } },
              { key: 'paste', label: labels.pasteWithShortcut, disabled: !canPaste, onClick: () => { setOpen(false); void editor?.pasteFromClipboard(); } },
              { key: 'delete', label: labels.deleteWithShortcut, disabled: !hasSelection, onClick: () => { setOpen(false); void editor?.deleteSelected(); } },
              { key: 'group', label: labels.groupWithShortcut, disabled: !canGroup, onClick: () => { setOpen(false); void editor?.groupSelected(); } },
              { key: 'ungroup', label: labels.ungroupWithShortcut, disabled: !canUngroup, onClick: () => { setOpen(false); void editor?.ungroupSelected(); } },
              { key: 'clear', label: labels.clear, onClick: () => { setOpen(false); void editor?.clearSceneNodes(); } },
              { key: 'reset', label: labels.reset, onClick: () => { setOpen(false); void editor?.resetWorkspace(); } }
            ]
          }
        ]}
        align="left"
        ariaLabel={labels.menuAriaLabel}
      />
      <button
        type="button"
        onClick={() => {
          void onExportBundle();
        }}
        disabled={!editor}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {labels.exportPackage}
      </button>
      <button
        type="button"
        onClick={onImportBundleClick}
        disabled={!editor}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {labels.importPackage}
      </button>
      <input
        ref={importBundleInputRef}
        type="file"
        accept="application/zip,.zip"
        className="hidden"
        onChange={onImportBundleChange}
      />
      <button
        type="button"
        onClick={onExportScreenshot}
        disabled={!editor}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {labels.screenshotExport}
      </button>
      <button
        type="button"
        onClick={() => { void onSaveScene(); }}
        disabled={!editor || isSaving}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {labels.saveScene}
      </button>
      {/* <button
        type="button"
        onClick={() => {}}
        disabled={!editor}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {labels.exportJson}
      </button>
      <button
        type="button"
        onClick={() => importInputRef.current?.click()}
        disabled={!editor}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {labels.importJson}
      </button> */}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onImportDocumentChange}
      />
      <button
        type="button"
        onClick={onToggleLocale}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        {loginT.localeSwitcher} ({locale})
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
        <span>{theme === 'dark' ? loginT.themeDark : loginT.themeLight}</span>
      </button>
    </div>
  );
}
