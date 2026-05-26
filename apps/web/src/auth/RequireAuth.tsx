import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isLogin } from '@/api/auth';
import { getAccessToken } from '@/utils/authStorage';
import { useLocale } from '@/hooks/useLocale';
import { appMessages } from '@/i18n/messages';

type Props = { children: JSX.Element };

/**
 * 路由鉴权护栏（轻量版）：
 * - 先用本地 token 做快速判定（减少首屏等待）
 * - 再异步向后端确认登录态（防止 token 过期/被撤销）
 *
 * 取舍：
 * - 不在这里强制 refresh（refresh 逻辑已在 `api/request.ts` 里统一处理）
 * - 校验失败时跳转登录，并携带来源地址，便于后续做“登录后返回原页面”
 */
export function RequireAuth({ children }: Props) {
  const location = useLocation();
  const { locale } = useLocale();
  const messages = appMessages[locale] ?? appMessages['zh-CN'] ?? appMessages['en-US'];
  const checkingText = messages?.common?.requireAuthChecking ?? 'Checking...';
  const hasToken = useMemo(() => {
    try {
      return Boolean(getAccessToken());
    } catch {
      return false;
    }
  }, []);
  const [verified, setVerified] = useState<boolean | null>(hasToken ? null : false);

  useEffect(() => {
    if (!hasToken) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await isLogin({ signal: controller.signal });
        setVerified(Boolean(res?.is_login));
      } catch {
        // 网络异常时不直接踢下线：保持现状，让后续业务请求自行触发错误提示
        setVerified(true);
      }
    })();
    return () => controller.abort();
  }, [hasToken]);

  if (verified === false) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // token 存在但尚未验证：给一个极轻的占位，避免布局抖动
  if (verified === null) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-sm text-[var(--text-muted)]">{checkingText}</div>
      </div>
    );
  }

  return children;
}

