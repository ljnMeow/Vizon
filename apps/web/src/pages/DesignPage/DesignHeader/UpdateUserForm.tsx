import { useEffect, useState } from 'react';
import { message } from '../../../components/GlobalMessage';
import { useLocale } from '../../../hooks/useLocale';
import { appMessages } from '../../../i18n/messages';

export type UpdateUserFormApi = { submit: () => Promise<void>; disabled: boolean };

/**
 * 更新用户昵称的表单组件：
 * - 暴露 submit/disabled 给外层对话框控制按钮状态
 * - 负责本地输入校验与调用 `onSaved` 完成持久化
 */
export function UpdateUserForm({
  initialNickname,
  onRegister,
  onDisabledChange,
  onSaved
}: {
  initialNickname: string;
  onRegister: (api: UpdateUserFormApi) => void;
  onDisabledChange: (disabled: boolean) => void;
  onSaved: (nextNickname: string) => Promise<void>;
}) {
  const { locale } = useLocale();
  const t = appMessages[locale];
  const [nickname, setNickname] = useState(initialNickname);
  const [saving, setSaving] = useState(false);

  const disabled = saving || !nickname.trim();

  useEffect(() => {
    onRegister({
      disabled,
      submit: async () => {
        const next = nickname.trim();
        if (!next) {
          await message.warning(t.profile.nicknameRequiredToast);
          onDisabledChange(true);
          return;
        }
        setSaving(true);
        onDisabledChange(true);
        const loading = message.loading(t.profile.savingToast);
        try {
          await onSaved(next);
          loading.hide();
          setSaving(false);
          onDisabledChange(false);
          await message.success(t.profile.savedToast);
        } catch (err) {
          loading.hide();
          setSaving(false);
          onDisabledChange(false);
          await message.error(t.profile.updateFailedToast);
          throw err;
        }
      }
    });
  }, [nickname, disabled, onRegister, onDisabledChange, onSaved]);

  useEffect(() => {
    onDisabledChange(disabled);
  }, [disabled]);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
          {t.profile.nicknameLabel}
        </label>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          placeholder={t.profile.nicknamePlaceholder}
        />
      </div>
    </div>
  );
}

