/**
 * 列表无限滚动：首页加载、滚动触底加载下一页、刷新重置到第 1 页。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ListPageResult } from '../api/listPagination';

/** 距底部该像素内视为触底，触发加载下一页。 */
export const SCROLL_LOAD_THRESHOLD_PX = 120;

type UseInfiniteScrollListOptions<T> = {
  /** 按页拉取数据 */
  fetchPage: (page: number) => Promise<ListPageResult<T>>;
  /**
   * 依赖变化时自动 refresh（如分类筛选）。
   * 传 undefined 表示仅在手动 refresh / 首次激活时拉取。
   */
  resetKey?: string | number;
  /** 为 false 时不自动拉取（如搜索框为空时关闭全局 models 流）。 */
  enabled?: boolean;
};

export function useInfiniteScrollList<T>({
  fetchPage,
  resetKey,
  enabled = true,
}: UseInfiniteScrollListOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(0);
  const inFlightRef = useRef(false);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  // generation token：resetKey 变化时递增，让旧请求结果作废
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setHasMore(false);
      setError(null);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    pageRef.current = 1;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHasMore(true);

    const gen = ++generationRef.current;

    // 不立即清空 items，避免 refresh 期间列表闪空白
    try {
      const result = await fetchPageRef.current(1);
      if (gen !== generationRef.current) return; // 旧请求，丢弃
      setItems(result.results);
      setHasMore(result.hasMore);
      pageRef.current = 1;
    } catch (err) {
      if (gen !== generationRef.current) return;
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw || 'error');
      setHasMore(false);
    } finally {
      if (gen === generationRef.current) {
        setLoading(false);
      }
      inFlightRef.current = false;
    }
  }, [enabled]);

  const loadMore = useCallback(async () => {
    if (!enabled || inFlightRef.current || loading || !hasMore) return;
    inFlightRef.current = true;
    setLoadingMore(true);

    const nextPage = pageRef.current + 1;
    const gen = generationRef.current;
    try {
      const result = await fetchPageRef.current(nextPage);
      if (gen !== generationRef.current) return;
      setItems((prev) => [...prev, ...result.results]);
      setHasMore(result.hasMore);
      pageRef.current = nextPage;
      setError(null); // 加载成功时清除之前的错误
    } catch (err) {
      if (gen !== generationRef.current) return;
      const raw = err instanceof Error ? err.message : String(err);
      setError(raw || 'error');
    } finally {
      if (gen === generationRef.current) {
        setLoadingMore(false);
      }
      inFlightRef.current = false;
    }
  }, [enabled, hasMore, loading]);

  const resetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    void refresh();
  }, [resetKey, refresh]);

  useEffect(() => {
    if (enabled) return;
    setItems([]);
    setHasMore(false);
    setLoading(false);
    setLoadingMore(false);
  }, [enabled]);

  const onListScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining <= SCROLL_LOAD_THRESHOLD_PX) {
        void loadMore();
      }
    },
    [loadMore]
  );

  return {
    items,
    setItems,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh,
    loadMore,
    onListScroll,
  };
}
