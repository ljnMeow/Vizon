import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme';
import { useLocale } from '../../hooks/useLocale';
import { loginMessages } from '../../i18n/messages';
import { ApiError } from '../../api/request';
import { isLogin, login } from '../../api/auth';
import { message } from '../../components/GlobalMessage';
import { STORAGE_KEYS } from '../../utils/storageKeys';
import LoginFormCard from './LoginFormCard';
import LoginHeader from './LoginHeader';
import LoginHeroSection from './LoginHeroSection';

interface LoginPageProps {
  onLoginSuccess?: () => void; // 保留扩展点（例如后续触发全局状态）
}

/**
 * 登录页主组件：
 * - 顶部提供主题/语言切换
 * - 中部展示品牌介绍与登录表单
 * - 处理自动登录检测与登录表单提交流程
 */
function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const navigate = useNavigate();
  const REMEMBER_ACCOUNT_KEY = STORAGE_KEYS.REMEMBER_ACCOUNT;
  const [rememberAccount, setRememberAccount] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.localStorage.getItem(REMEMBER_ACCOUNT_KEY));
  });
  const [username, setUsername] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(REMEMBER_ACCOUNT_KEY) ?? '';
  });
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 根据当前语言选择对应的文案集合
  const t = loginMessages[locale];

  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const checking = message.loading(tRef.current.toastCheckingLogin, { blockInteraction: false });
      try {
        const res = await isLogin({ signal: controller.signal });
        checking.hide();
        if (res?.is_login) {
          await message.info(tRef.current.toastAlreadyLoggedIn);
          navigate('/design', { replace: true });
        }
      } catch {
        checking.hide();
        // 忽略：登录页兜底仍可手动登录
      }
    })();
    return () => controller.abort();
  }, [navigate]);

  /**
   * 从后端返回的嵌套结构中尽可能提取可读的错误文案。
   */
  const extractApiErrorMessage = (payload: unknown): string | null => {
    if (!payload) return null;
    if (typeof payload === 'string') return payload.trim() || null;
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const m = extractApiErrorMessage(item);
        if (m) return m;
      }
      return null;
    }
    if (typeof payload === 'object') {
      const anyPayload = payload as any;
      if (anyPayload.detail) return String(anyPayload.detail).trim() || null;
      for (const v of Object.values(anyPayload)) {
        const m = extractApiErrorMessage(v);
        if (m) return m;
      }
    }
    return null;
  };

  /**
   * 统一解析登录异常，优先展示后端错误信息，其次使用本地兜底文案。
   */
  const resolveLoginErrorText = (err: unknown) => {
    if (err instanceof ApiError) {
      const msg = typeof err.message === 'string' ? err.message.trim() : '';
      if (msg && msg !== 'error') return msg;
      const fromErrors = extractApiErrorMessage(err.errors);
      if (fromErrors) return fromErrors;
    }
    return t.toastLoginFailed;
  };

  /**
   * 在中英文之间切换当前语言。
   */
  const handleToggleLocale = () => {
    // 简单的中英文切换逻辑：在 zh-CN 与 en-US 之间来回切换
    setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN');
  };

  /**
   * 登录表单提交逻辑：
   * - 调用登录接口
   * - 处理本地记住账号
   * - 登录成功后跳转到设计页
   */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const loading = message.loading(t.toastSigningIn);
    try {
      await login({ username, password });
      loading.hide();
      setSubmitting(false);
      if (rememberAccount) {
        window.localStorage.setItem(REMEMBER_ACCOUNT_KEY, username);
      } else {
        window.localStorage.removeItem(REMEMBER_ACCOUNT_KEY);
      }
      await message.success(t.toastSignedIn);
      onLoginSuccess?.();
      navigate('/design', { replace: true });
    } catch (e) {
      loading.hide();
      setSubmitting(false);
      void message.error(resolveLoginErrorText(e));
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors">
      {/* 顶部工具栏：Logo + 产品名 + 主题/语言切换 */}
      <LoginHeader
        t={t}
        theme={theme}
        locale={locale}
        onToggleLocale={handleToggleLocale}
        onToggleTheme={toggleTheme}
      />

      {/* 中间主区域：左侧品牌 & 描述，右侧登录卡片 */}
      <main className="mx-auto flex min-h-[calc(100vh-80px)] max-w-5xl flex-col gap-10 px-6 pb-12 pt-4 md:flex-row md:items-center">
        {/* 左侧：品牌叙事区 */}
        <LoginHeroSection t={t} />

        {/* 右侧：登录表单卡片 */}
        <LoginFormCard
          t={t}
          username={username}
          password={password}
          rememberAccount={rememberAccount}
          passwordVisible={passwordVisible}
          submitting={submitting}
          onSubmit={handleSubmit}
          onUsernameChange={setUsername}
          onPasswordChange={setPassword}
          onRememberAccountChange={setRememberAccount}
          onTogglePasswordVisible={() => setPasswordVisible((v) => !v)}
        />
      </main>
    </div>
  );
}

export default LoginPage;

