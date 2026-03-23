import React, { createContext, useContext, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../utils/storageKeys';

export type Locale = 'zh-CN' | 'en-US';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

const LOCALE_STORAGE_KEY = STORAGE_KEYS.LOCALE;

/**
 * 提供全局语言环境（Locale）：
 * - 优先从 localStorage 读取
 * - 其次根据浏览器语言推断
 * - 最后回退到 zh-CN
 */
export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 懒加载初始化：优先 localStorage，其次系统语言，最后回退到 zh-CN
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
    if (stored === 'zh-CN' || stored === 'en-US') {
      return stored;
    }

    // 从浏览器环境推断系统语言
    const navLang =
      (typeof navigator !== 'undefined' &&
        (navigator.language || navigator.languages?.[0])) ||
      '';
    const lower = navLang.toLowerCase();

    if (lower.startsWith('zh')) {
      return 'zh-CN';
    }

    return 'en-US';
  });

  useEffect(() => {
    // 每次语言变更时写入 localStorage，保证下次打开页面时仍然生效
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  /**
   * 外部调用的设置语言方法，统一收敛到内部 state。
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

