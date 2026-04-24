import { useEffect, useMemo, useRef, useState } from 'react';
import { GlobalMenu } from '../../../../components/GlobalMenu';
import { useLocale } from '../../../../hooks/useLocale';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { useTheme } from '../../../../hooks/useTheme';
import { appMessages } from '../../../../i18n/messages';

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function ActionBar() {
  const { editor } = useSceneSettings();
  const { locale, setLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [canPaste, setCanPaste] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const labels = useMemo(() => appMessages[locale].designPage.actionBar, [locale]);
  const loginT = appMessages[locale].auth.login;

  useEffect(() => {
    if (!editor) {
      setCanUndo(false);
      setCanRedo(false);
      setCanPaste(false);
      setHasSelection(false);
      return;
    }
    const refresh = () => {
      setCanUndo(editor.canUndo());
      setCanRedo(editor.canRedo());
      setCanPaste(editor.canPaste());
      setHasSelection(Boolean(editor.getSelected()));
    };
    refresh();
    const offHistory = editor.on('historyChange', refresh);
    const offSelect = editor.on('select', refresh);
    return () => {
      offHistory?.();
      offSelect?.();
    };
  }, [editor]);

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
      if (e.key === 'Delete') {
        e.preventDefault();
        void editor.deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const onToggleLocale = () => {
    setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN');
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
              { key: 'clear', label: labels.clear, onClick: () => { setOpen(false); void editor?.clearSceneNodes(); } },
              { key: 'reset', label: labels.reset, onClick: () => { setOpen(false); void editor?.resetWorkspace(); } }
            ]
          }
        ]}
        align="left"
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
