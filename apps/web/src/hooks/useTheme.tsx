import React, { createContext, useContext, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../utils/keys';

/**
 * 主题类型：
 * - light：浅色主题
 * - dark：深色主题
 */
export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/** localStorage 中保存主题偏好的 key。 */
const THEME_STORAGE_KEY = STORAGE_KEYS.THEME;

/**
 * 提供全局主题上下文：
 * - 从 localStorage 或系统首选项推断初始主题
 * - 负责同步 html[data-theme] 与 Tailwind 的 dark class
 */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 初始主题解析顺序：用户本地设置 > 系统 prefers-color-scheme > 默认浅色。
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;

    if (stored === 'light' || stored === 'dark') {
      return stored;
    }

    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });

  useEffect(() => {
    // 同步到 DOM：
    // 1. `data-theme` 便于 CSS 变量方案读取
    // 2. `dark` class 便于 Tailwind 暗色模式生效
    document.documentElement.dataset.theme = theme;

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  /**
   * 切换深浅主题。
   */
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * 自定义 Hook：访问当前主题与切换方法。
 * 必须在 `ThemeProvider` 内部使用。
 */
export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);

  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return ctx;
};

