import { FormEvent } from 'react';

interface LoginFormCardProps {
  t: any;
  username: string;
  password: string;
  rememberAccount: boolean;
  passwordVisible: boolean;
  submitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRememberAccountChange: (value: boolean) => void;
  onTogglePasswordVisible: () => void;
}

function LoginFormCard({
  t,
  username,
  password,
  rememberAccount,
  passwordVisible,
  submitting,
  onSubmit,
  onUsernameChange,
  onPasswordChange,
  onRememberAccountChange,
  onTogglePasswordVisible,
}: LoginFormCardProps) {
  return (
    <section className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 px-7 py-7 shadow-2xl shadow-[rgba(15,23,42,0.65)] backdrop-blur">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            {t.emailLabel}
          </label>
          <input
            type="email"
            autoComplete="email"
            required
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none ring-0 transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] placeholder:text-[var(--text-muted)]"
            placeholder={t.emailPlaceholder}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            {t.passwordLabel}
          </label>
          <div className="relative">
            <input
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3.5 py-2.5 pr-10 text-sm text-[var(--text-primary)] outline-none ring-0 transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] placeholder:text-[var(--text-muted)]"
              placeholder={t.passwordPlaceholder}
            />
            <button
              type="button"
              onClick={onTogglePasswordVisible}
              aria-label={passwordVisible ? t.hidePassword : t.showPassword}
              className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <span className="text-sm">{passwordVisible ? '🙈' : '👀'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={rememberAccount}
              onChange={(e) => onRememberAccountChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--accent)] focus:ring-[var(--accent-soft)]"
            />
            <span>{t.rememberMe}</span>
          </label>

          <button type="button" className="text-[var(--accent)] hover:text-[var(--accent-strong)]">
            {t.forgotPassword}
          </button>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-4 flex w-full items-center justify-center rounded-md bg-[var(--accent)] px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--accent-strong)] active:scale-[0.99]"
        >
          {submitting ? `${t.loginButton}...` : t.loginButton}
        </button>
      </form>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">{t.noAccount}</p>
    </section>
  );
}

export default LoginFormCard;

