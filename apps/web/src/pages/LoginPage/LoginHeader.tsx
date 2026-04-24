import LogoMark from '../../components/LogoMark';

interface LoginHeaderProps {
  t: any;
  theme: string;
  locale: string;
  onToggleLocale: () => void;
  onToggleTheme: () => void;
}

/** 登录页头部：展示品牌信息，并提供语言/主题切换。 */
function LoginHeader({ t, theme, locale, onToggleLocale, onToggleTheme }: LoginHeaderProps) {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 p-1 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 shadow-sm">
          <LogoMark />
        </div>
        <div className="leading-tight">
          <p className="text-md font-semibold">{t.title}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {/* 语言切换按钮：在中英之间切换 */}
        <button
          type="button"
          onClick={onToggleLocale}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          {t.localeSwitcher} ({locale})
        </button>

        {/* 主题切换按钮：根据当前主题显示即将切换到的视觉模式名称。 */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
          <span>{theme === 'dark' ? t.themeDark : t.themeLight}</span>
        </button>
      </div>
    </header>
  );
}

export default LoginHeader;

