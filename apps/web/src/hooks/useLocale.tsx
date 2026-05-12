import React, { createContext, useContext, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../utils/keys';

export type Locale = 'zh-CN' | 'en-US';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

/** localStorage 中保存语言偏好的 key。 */
const LOCALE_STORAGE_KEY = STORAGE_KEYS.LOCALE;

/**
 * 读取当前应使用的语言（与 LocaleProvider 首次 state 逻辑一致）。
 * 供 ErrorBoundary 等位于 LocaleProvider 之外的组件使用。
 */
export function readStoredLocale(): Locale {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (stored === 'zh-CN' || stored === 'en-US') {
    return stored;
  }
  const navLang =
    (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) || '';
  const lower = navLang.toLowerCase();
  if (lower.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en-US';
}

/**
 * 提供全局语言环境（Locale）：
 * - 优先从 localStorage 读取
 * - 其次根据浏览器语言推断
 * - 最后回退到 zh-CN
 */
export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 懒加载初始化：避免每次渲染都重复访问 localStorage / navigator。
  // 优先读取用户显式选择，其次根据系统语言推断默认值。
  const [locale, setLocale] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    // 每次语言变更时写入 localStorage，保证下次打开页面时仍然生效
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  /**
   * 对外暴露统一的语言切换入口。
   * 单独包装一层，便于后续在切换时插入埋点、服务端同步等附加逻辑。
   */
  const handleSetLocale = (next: Locale) => {
    setLocale(next);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale: handleSetLocale }}>
      {children}
    </LocaleContext.Provider>
  );
};

/**
 * 自定义 Hook：读取当前语言与切换方法。
 * 必须在 `LocaleProvider` 内部使用。
 */
export const useLocale = (): LocaleContextValue => {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
};

