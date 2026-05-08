import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import { LocaleProvider } from './hooks/useLocale';
import { GlobalDialogProvider } from './components/GlobalDialog';
import { GlobalMessageProvider } from './components/GlobalMessage';
import { RequireAuth } from '@/auth/RequireAuth';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DesignPage = lazy(() => import('./pages/DesignPage'));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex items-center justify-center">
      <div className="text-sm text-[var(--text-muted)]">Loading…</div>
    </div>
  );
}

/**
 * 应用根组件：
 * - 组合主题 / 语言 / 全局消息 / 全局对话框四个 Provider
 * - 提供登录页与设计页的基础路由
 */
function App() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <GlobalMessageProvider>
          <GlobalDialogProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/design"
                  element={
                    <RequireAuth>
                      <DesignPage />
                    </RequireAuth>
                  }
                />
                {/* 默认重定向到登录页；业务扩展时可以替换成更细粒度的路由表 */}
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </Suspense>
          </GlobalDialogProvider>
        </GlobalMessageProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

export default App;
