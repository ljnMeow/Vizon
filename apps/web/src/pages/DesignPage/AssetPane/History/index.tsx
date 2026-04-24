
import { useEffect, useMemo, useState } from 'react';
import type { EditorHistoryRecord } from 'vizon-3d-core';
import { useLocale } from '../../../../hooks/useLocale';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { appMessages } from '../../../../i18n/messages';
import { decodeHistoryI18nName } from '../../../../utils/historyI18n';

/**
 * 历史记录面板。
 * 监听编辑器历史栈变化，并按当前语言解码显示每条操作名称。
 */
export function History() {
  const { editor } = useSceneSettings();
  const { locale } = useLocale();
  const t = appMessages[locale].assetPane;
  const [records, setRecords] = useState<EditorHistoryRecord[]>([]);

  // editor 切换时重新订阅历史记录，保证列表始终与当前工作区实例一致。
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

  // 时间戳仅做本地化格式化展示，记录名称的多语言转换交由 historyI18n 处理。
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
    return <div className="h-full overflow-y-auto p-3 text-xs text-[var(--text-muted)]">{t.historyEmpty}</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <ul className="space-y-2">
        {records.map((item) => (
          <li key={item.id} className="rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 px-2 py-2">
            <div className="text-xs text-[var(--text-primary)]">{decodeHistoryI18nName(item.name, locale)}</div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">{formatter.format(item.timestamp)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
