import { useEffect, useRef } from 'react';

/**
 * 仅在 Tab 首次变为激活时执行 fetch。
 * 再次切换回该 Tab 不会重复请求，需通过面板内「刷新」手动拉取。
 */
export function useFetchOnFirstActive(
  isActive: boolean,
  fetch: () => void | Promise<void>
): void {
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!isActive || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    void fetch();
  }, [isActive, fetch]);
}
