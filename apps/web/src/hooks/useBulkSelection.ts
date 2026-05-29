import { useCallback, useState } from 'react';

/**
 * 通用批量选择 hook，提取模型面板与贴图面板共享的选择模式逻辑。
 *
 * @param items   当前可选择的条目列表
 * @param getId   从条目中提取唯一标识的函数
 */
export function useBulkSelection<T>(
  items: T[],
  getId: (item: T) => string,
) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map(getId));
    });
  }, [items, getId]);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  return {
    selectMode,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    toggleSelectMode,
    exitSelectMode,
  } as const;
}
