import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../../hooks/useTheme';
import { useLocale } from '../../../hooks/useLocale';
import { appMessages } from '../../../i18n/messages';
import LogoMark from '../../../components/LogoMark';
import { GlobalMenu } from '../../../components/GlobalMenu';
import { getUserInfo, setUserInfo, clearAuthTokens, clearUserInfo } from '../../../utils/authStorage';
import { logout } from '../../../api/auth';
import { message } from '../../../components/GlobalMessage';
import { dialog } from '../../../components/GlobalDialog';
import { updateCustomer } from '../../../api/customers';
import { UpdateUserForm, type UpdateUserFormApi } from './UpdateUserForm';

type StoredUser = {
  account_id?: string;
  username?: string;
  nickname?: string;
};

export function DesignHeader() {
  const { theme, toggleTheme } = useTheme();
  const { locale } = useLocale();
  const t = appMessages[locale];
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const [storedUser, setStoredUser] = useState<StoredUser | null>(() => getUserInfo<StoredUser>());
  const displayName = useMemo(
    () => (storedUser?.nickname || storedUser?.username || '').trim() || t.profile.nicknameFallback,
    [storedUser]
  );
  const initial = displayName.charAt(0);

  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // 后端 logout 设计为幂等，这里忽略异常，继续清理本地状态
    } finally {
      clearAuthTokens();
      clearUserInfo();
      await message.success(t.auth.logoutSuccessToast);
      navigate('/login', { replace: true });
    }
  };

  const openProfileDialog = () => {
    setMenuOpen(false);

    const accountId = storedUser?.account_id;
    if (!accountId) {
      void message.warning(t.auth.missingAccountIdToast);
      return;
    }

    void dialog.custom({
      title: t.profile.profileDialogTitle,
      confirmText: t.profile.profileDialogConfirm,
      cancelText: t.profile.profileDialogCancel,
      renderBody: ({ setConfirmHandler, setConfirmDisabled }) => (
        <UpdateUserForm
          initialNickname={storedUser?.nickname ?? ''}
          onRegister={(api: UpdateUserFormApi) => {
            setConfirmHandler(api.submit);
            setConfirmDisabled(api.disabled);
          }}
          onDisabledChange={(disabled: boolean) => setConfirmDisabled(disabled)}
          onSaved={async (nextNickname: string) => {
            await updateCustomer(accountId, { nickname: nextNickname });
            const nextUser = { ...(storedUser ?? {}), nickname: nextNickname };
            setUserInfo(nextUser);
            setStoredUser(nextUser);
          }}
        />
      )
    });
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-[var(--border-subtle)] px-3 md:px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 p-1 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 shadow-sm">
          <LogoMark />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">{t.common.brandName}</p>
        </div>
      </div>

      <div ref={menuContainerRef} className="relative z-[2147483647] flex items-center gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 px-3 py-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
          <span>{theme === 'dark' ? t.auth.login.themeDark : t.auth.login.themeLight}</span>
        </button>

        {/* 头像 + 昵称按钮：放在头部导航中 */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 p-1 text-xs text-[var(--text-secondary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-semibold text-white">
            {initial}
          </span>
        </button>

        <GlobalMenu
          open={menuOpen}
          containerRef={menuContainerRef}
          onRequestClose={() => setMenuOpen(false)}
          groups={[
            {
              key: 'workspace',
              title: displayName,
              itemDividers: false,
              items: [{ key: 'profile', label: t.profile.profileMenuLabel, onClick: openProfileDialog }]
            },
            {
              key: 'account',
              items: [
                {
                  key: 'logout',
                  label: t.profile.logoutMenuLabel,
                  onClick: () => {
                    setMenuOpen(false);
                    handleLogout();
                  }
                }
              ]
            }
          ]}
        />
      </div>
    </header>
  );
}

