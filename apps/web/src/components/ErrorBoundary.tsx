import { Component, type ErrorInfo, type ReactNode } from 'react';
import { readStoredLocale } from '../hooks/useLocale';
import { appMessages } from '../i18n/messages';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = { hasError: boolean };

/**
 * 全局错误边界：
 * - 捕获渲染阶段异常，避免应用整页白屏
 * - 兜底 UI 保持轻量；更复杂的错误上报可以在这里接入（Sentry/自研日志等）
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const locale = readStoredLocale();
      const t = appMessages[locale].common;
      return (
        <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)]/80 p-6 shadow-lg">
            <div className="text-lg font-semibold">{t.errorBoundaryTitle}</div>
            <div className="mt-2 text-sm text-[var(--text-muted)]">{t.errorBoundaryDescription}</div>
            <div className="mt-4 flex gap-3">
              <button
                className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15 transition-colors"
                onClick={() => window.location.reload()}
              >
                {t.errorBoundaryReload}
              </button>
              <a className="rounded-lg px-4 py-2 text-sm hover:bg-white/10 transition-colors" href="/login">
                {t.errorBoundaryBackToLogin}
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

