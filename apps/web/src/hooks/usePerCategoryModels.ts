/**
 * 按分类缓存模型列表：每个分类一次性拉取全量（GET ?category=，响应 data 为数组）。
 */

import { useCallback, useRef, useState } from 'react';

import { listModel3dsByCategory, type Model3dMeta } from '../api/model3ds';

type CategoryModelsSlot = {
  items: Model3dMeta[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

function emptySlot(): CategoryModelsSlot {
  return {
    items: [],
    loaded: false,
    loading: false,
    error: null,
  };
}

export function usePerCategoryModels() {
  const [byCategory, setByCategory] = useState<Record<string, CategoryModelsSlot>>({});
  const inflightRef = useRef<Record<string, boolean>>({});

  const loadAll = useCallback(async (categoryId: string, force = false) => {
    if (inflightRef.current[categoryId]) return;

    let shouldSkip = false;
    setByCategory((prev) => {
      const cur = prev[categoryId] ?? emptySlot();
      if (!force && (cur.loaded || cur.loading)) {
        shouldSkip = true;
        return prev;
      }
      return {
        ...prev,
        [categoryId]: { ...cur, loading: true, error: null },
      };
    });
    if (shouldSkip) return;

    inflightRef.current[categoryId] = true;

    try {
      const items = await listModel3dsByCategory(categoryId);
      setByCategory((prev) => ({
        ...prev,
        [categoryId]: {
          items,
          loaded: true,
          loading: false,
          error: null,
        },
      }));
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setByCategory((prev) => {
        const cur = prev[categoryId] ?? emptySlot();
        return {
          ...prev,
          [categoryId]: {
            ...cur,
            loading: false,
            loaded: false,
            error: raw || 'error',
          },
        };
      });
    } finally {
      inflightRef.current[categoryId] = false;
    }
  }, []);

  const getSlot = useCallback(
    (categoryId: string): CategoryModelsSlot => byCategory[categoryId] ?? emptySlot(),
    [byCategory]
  );

  /** 尚未加载过该分类时拉取全量。 */
  const ensureLoaded = useCallback(
    (categoryId: string) => {
      void loadAll(categoryId, false);
    },
    [loadAll]
  );

  const refreshCategory = useCallback(
    (categoryId: string) => loadAll(categoryId, true),
    [loadAll]
  );

  const clearAll = useCallback(() => {
    setByCategory({});
  }, []);

  const upsertModel = useCallback((model: Model3dMeta) => {
    const categoryId = model.category_id;
    setByCategory((prev) => {
      const cur = prev[categoryId] ?? emptySlot();
      const idx = cur.items.findIndex((m) => m.model_id === model.model_id);
      const items =
        idx >= 0
          ? cur.items.map((m, i) => (i === idx ? model : m))
          : [model, ...cur.items];
      return { ...prev, [categoryId]: { ...cur, items, loaded: true } };
    });
  }, []);

  const removeModels = useCallback((ids: Set<string>) => {
    setByCategory((prev) => {
      const next: Record<string, CategoryModelsSlot> = { ...prev };
      for (const [categoryId, slot] of Object.entries(next)) {
        const items = slot.items.filter((m) => !ids.has(m.model_id));
        if (items.length !== slot.items.length) {
          next[categoryId] = { ...slot, items };
        }
      }
      return next;
    });
  }, []);

  const moveModelToCategory = useCallback((model: Model3dMeta, fromCategoryId: string) => {
    setByCategory((prev) => {
      const next: Record<string, CategoryModelsSlot> = { ...prev };
      const from = next[fromCategoryId];
      if (from) {
        next[fromCategoryId] = {
          ...from,
          items: from.items.filter((m) => m.model_id !== model.model_id),
        };
      }
      const to = next[model.category_id] ?? emptySlot();
      const exists = to.items.some((m) => m.model_id === model.model_id);
      next[model.category_id] = {
        ...to,
        items: exists
          ? to.items.map((m) => (m.model_id === model.model_id ? model : m))
          : [model, ...to.items],
        loaded: true,
      };
      return next;
    });
  }, []);

  const getAllLoadedModels = useCallback(
    () => Object.values(byCategory).flatMap((slot) => slot.items),
    [byCategory]
  );

  return {
    getSlot,
    ensureLoaded,
    refreshCategory,
    clearAll,
    upsertModel,
    removeModels,
    moveModelToCategory,
    getAllLoadedModels,
  };
}
