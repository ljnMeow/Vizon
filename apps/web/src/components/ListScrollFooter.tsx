/** 列表滚动加载底部状态。 */
import { useLocale } from '../hooks/useLocale';
import { appMessages } from '../i18n/messages';

export function ListScrollFooter({
  loading,
  loadingMore,
  hasMore,
}: {
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
}) {
  const { locale } = useLocale();
  // 初次加载、未在加载更多但还有更多（避免占用空白）→ 不渲染
  if (loading) return null;
  if (!loadingMore && hasMore) return null;
  return (
    <div className="py-2 text-center text-[10px] text-[var(--text-muted)]">
      {loadingMore ? appMessages[locale].common.loadingMore : appMessages[locale].common.noMore}
    </div>
  );
}
