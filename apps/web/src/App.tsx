import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import { LocaleProvider } from './hooks/useLocale';
import { GlobalDialogProvider } from './components/GlobalDialog';
import { GlobalMessageProvider } from './components/GlobalMessage';
import LoginPage from './pages/LoginPage';
import DesignPage from './pages/DesignPage';

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
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/design" element={<DesignPage />} />
              {/* 默认重定向到登录页，后续可以在这里做鉴权判断 */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </GlobalDialogProvider>
        </GlobalMessageProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

export default App;
