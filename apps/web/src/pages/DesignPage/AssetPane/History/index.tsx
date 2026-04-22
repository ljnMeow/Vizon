import { useEffect, useMemo, useState } from 'react';
import type { EditorHistoryRecord } from 'vizon-3d-core';
import { useLocale } from '../../../../hooks/useLocale';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { appMessages } from '../../../../i18n/messages';

export function History() {
  const { editor } = useSceneSettings();
  const { locale } = useLocale();
  const t = appMessages[locale].assetPane;
  const historyEmptyText = (t as any).historyEmpty ?? (locale === 'zh-CN' ? '暂无操作历史' : 'No history records yet');
  const [records, setRecords] = useState<EditorHistoryRecord[]>([]);

  useEffect(() => {
    if (!editor) {
      setRecords([]);
      return;
    }
    setRecords(editor.getHistoryRecords());
    const off = editor.on('historyChange', ({ records: next }) => {
      setRecords(next);
    });
    return off;
  }, [editor]);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
    [locale]
  );

  if (records.length === 0) {
    return <div className="h-full overflow-y-auto p-3 text-xs text-[var(--text-muted)]">{historyEmptyText}</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <ul className="space-y-2">
        {records.map((item) => (
          <li key={item.id} className="rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 px-2 py-2">
            <div className="text-xs text-[var(--text-primary)]">{item.name}</div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">{formatter.format(item.timestamp)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
