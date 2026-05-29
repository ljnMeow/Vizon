/**
 * 与后端 StandardResultsPagination 对齐的列表结构。
 */

import { api } from './request';

export type PaginatedList<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

/** 单页拉取结果（供无限滚动使用）。 */
export type ListPageResult<T> = {
  results: T[];
  count: number;
  hasMore: boolean;
};

/** 与后端 API_PAGE_SIZE 对齐（默认 20）。 */
export const DEFAULT_LIST_PAGE_SIZE = 20;

/** 兼容分页与历史扁平数组响应（仅取当前页，不合并多页）。 */
export function unwrapList<T>(data: T[] | PaginatedList<T>): T[] {
  return parsePaginatedList(data).results;
}

/** 解析分页响应。 */
export function parsePaginatedList<T>(
  data: T[] | PaginatedList<T>,
  _pageSize: number = DEFAULT_LIST_PAGE_SIZE
): ListPageResult<T> {
  if (Array.isArray(data)) {
    return {
      results: data,
      count: data.length,
      hasMore: false,
    };
  }
  const results = data.results ?? [];
  const count = typeof data.count === 'number' ? data.count : results.length;
  const hasMore = Boolean(data.next);
  return { results, count, hasMore };
}

/** 构造列表查询参数字符串（不含前导 ?）。 */
export function buildListQuery(
  page: number,
  params?: Record<string, string | undefined>,
  pageSize: number = DEFAULT_LIST_PAGE_SIZE
): string {
  const q = new URLSearchParams();
  q.set('page', String(page));
  q.set('page_size', String(pageSize));
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        q.set(key, value);
      }
    }
  }
  return q.toString();
}

/** 通用：按 path 拉取一页列表。 */
export async function fetchListPage<T>(
  path: string,
  page: number,
  params?: Record<string, string | undefined>,
  pageSize: number = DEFAULT_LIST_PAGE_SIZE
): Promise<ListPageResult<T>> {
  const joiner = path.includes('?') ? '&' : '';
  const qs = buildListQuery(page, params, pageSize);
  const url = path.includes('?') ? `${path}${joiner}${qs}` : `${path}?${qs}`;
  const data = await api.get<T[] | PaginatedList<T>>(url);
  return parsePaginatedList(data, pageSize);
}
