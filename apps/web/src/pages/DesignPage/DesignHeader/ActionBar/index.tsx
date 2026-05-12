import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import { importDocument, VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT } from 'vizon-3d-core';
import { GlobalMenu } from '../../../../components/GlobalMenu';
import { useLocale } from '../../../../hooks/useLocale';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { useTheme } from '../../../../hooks/useTheme';
import { appMessages } from '../../../../i18n/messages';
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

/**
 * 设计器顶部操作栏。
 * 聚合撤销/重做、复制粘贴、删除、清空、重置以及语言/主题切换入口。
 */
export function ActionBar() {
  const { editor } = useSceneSettings();
  const { locale, setLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [canPaste, setCanPaste] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [canGroup, setCanGroup] = useState(false);
  const [canUngroup, setCanUngroup] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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

  const onExportDocument = () => {
    if (!editor) return;
    const doc = editor.getVizonDocument({ generator: 'apps/web-actionbar' });
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `vizon-document-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onImportDocumentClick = () => {
    // 系统文件框可能导致 Shift 的 keyup 丢失；先重置修饰态，避免导入后视口拾取一直处于 toggle、Gizmo 不显示。
    editor?.resetShiftMultiselectState();
    importInputRef.current?.click();
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
      window.alert(`${labels.importFailedPrefix}${msg}`);
    } finally {
      // 允许重复导入同一文件（浏览器对同名同文件不会重复触发 change）。
      inputEl.value = '';
      // 解析失败等路径不会走 importDocument 内的重置；仍要恢复 Shift/Gizmo 相关状态。
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
        onClick={onExportDocument}
        disabled={!editor}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {labels.exportJson}
      </button>
      <button
        type="button"
        onClick={onImportDocumentClick}
        disabled={!editor}
        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {labels.importJson}
      </button>
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
