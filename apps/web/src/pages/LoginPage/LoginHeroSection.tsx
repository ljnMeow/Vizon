interface LoginHeroSectionProps {
  t: any;
}

function LoginHeroSection({ t }: LoginHeroSectionProps) {
  return (
    <section className="relative flex-1 space-y-6">
      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
          ●
        </span>
        <span>{t.badge}</span>
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t.subtitle}</h1>
        <p className="max-w-md text-sm leading-relaxed text-[var(--text-muted)]">{t.heroBody}</p>
      </div>
    </section>
  );
}

export default LoginHeroSection;

