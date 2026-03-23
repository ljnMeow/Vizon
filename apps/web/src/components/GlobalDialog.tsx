import React, { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useLocale } from '../hooks/useLocale';
import { appMessages } from '../i18n/messages';

type DialogVariant = 'confirm' | 'custom';

type CloseReason = 'confirm' | 'cancel' | 'close' | 'mask' | 'esc';

type DialogRequest = {
  id: string;
  variant: DialogVariant;
  title?: ReactNode;
  /** 中间区域内容（可选） */
  content?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  closeOnMask?: boolean;
  closeOnEsc?: boolean;
  /**
   * 点击确认/取消/关闭/遮罩/ESC 时触发。
   * 返回 false（或 resolve 为 false）可阻止本次关闭。
   */
  onRequestClose?: (reason: CloseReason) => boolean | Promise<boolean>;
  /**
   * 自定义 body（只渲染中间内容；标题与底部按钮由 GlobalDialog 统一提供）。
   * 通过 ctx.setConfirmHandler 注册“确定”按钮的提交逻辑。
   */
  renderBody?: (ctx: DialogBodyContext) => ReactNode;
};

type Controller = {
  open(req: Omit<DialogRequest, 'id'>): Promise<unknown>;
  closeAll(): void;
};

let controller: Controller | null = null;

type DialogBodyContext = {
  close: (result?: unknown) => void;
  setConfirmHandler: (handler: (() => unknown | Promise<unknown>) | null) => void;
  setConfirmDisabled: (disabled: boolean) => void;
  setConfirmLoadingText: (text: string | null) => void;
};

/**
 * 全局对话框控制器：
 * - 通过 `dialog.open / dialog.confirm / dialog.custom` 打开弹窗
 * - 由 `GlobalDialogProvider` 在应用根部挂载并接管具体渲染
 */
export const dialog = {
  open(opts: Omit<DialogRequest, 'id'>) {
    return controller?.open(opts) ?? Promise.resolve();
  },
  confirm(opts: {
    title?: ReactNode;
    content?: ReactNode;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    closeOnMask?: boolean;
    onRequestClose?: (reason: CloseReason) => boolean | Promise<boolean>;
  }): Promise<boolean> {
    return (
      controller?.open({
        variant: 'confirm',
        title: opts.title,
        content: opts.content,
        confirmText: opts.confirmText,
        cancelText: opts.cancelText,
        danger: opts.danger ?? false,
        closeOnMask: opts.closeOnMask ?? false,
        closeOnEsc: true,
        onRequestClose: opts.onRequestClose
      }).then((v) => v === true) ?? Promise.resolve(false)
    );
  },
  custom(opts: {
    title?: ReactNode;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    closeOnMask?: boolean;
    onRequestClose?: (reason: CloseReason) => boolean | Promise<boolean>;
    renderBody: (ctx: DialogBodyContext) => ReactNode;
  }) {
    return (
      controller?.open({
        variant: 'custom',
        title: opts.title,
        confirmText: opts.confirmText,
        cancelText: opts.cancelText,
        danger: opts.danger ?? false,
        closeOnMask: opts.closeOnMask ?? false,
        closeOnEsc: true,
        onRequestClose: opts.onRequestClose,
        renderBody: opts.renderBody
      }) ?? Promise.resolve()
    );
  },
  closeAll() {
    controller?.closeAll();
  }
} as const;

/**
 * 单个对话框的外壳组件，负责：
 * - 调用拦截器 `onRequestClose`
 * - 管理提交中 / 关闭动画等状态
 * - 将 body 上下文透传给 `renderBody`
 */
function DialogShell({
  req,
  onResolve
}: {
  req: DialogRequest;
  onResolve: (result?: unknown) => void;
}) {
  const { locale } = useLocale();
  const t = appMessages[locale].common;

  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  const confirmHandlerRef = useRef<null | (() => unknown | Promise<unknown>)>(null);
  const [confirmDisabled, setConfirmDisabled] = useState(false);
  const [confirmLoadingText, setConfirmLoadingText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  /**
   * 根据拦截器返回结果判断是否允许关闭当前对话框。
   */
  const shouldClose = async (reason: CloseReason) => {
    try {
      const r = req.onRequestClose?.(reason);
      if (typeof r === 'boolean') return r;
      if (r && typeof (r as Promise<boolean>).then === 'function') return await r;
      return true;
    } catch {
      // 拦截器抛错时，为避免“永远关不掉”，默认允许关闭
      return true;
    }
  };

  /**
   * 触发关闭流程：先校验 `shouldClose`，再触发离场动画并在动画结束后 resolve。
   */
  const requestClose = async (reason: CloseReason, result?: unknown) => {
    // 提交过程中阻止“非确认”关闭（ESC/遮罩/取消/关闭按钮等），但允许确认成功后正常关闭
    if (submittingRef.current && reason !== 'confirm') return;
    const ok = await shouldClose(reason);
    if (!ok) return;
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      onResolveRef.current(result);
    }, 180);
  };

  useEffect(() => {
    if (!req.closeOnEsc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void requestClose('esc', undefined);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [req.closeOnEsc]);

  /**
   * 供 body 内部直接调用的立即关闭方法（不走动画）。
   */
  const close = (result?: unknown) => onResolve(result);

  const bodyCtx: DialogBodyContext = useMemo(
    () => ({
      close,
      setConfirmHandler: (h) => {
        confirmHandlerRef.current = h;
      },
      setConfirmDisabled,
      setConfirmLoadingText
    }),
    []
  );

  /**
   * 处理“取消”按钮点击：
   * - confirm 模式下 resolve 为 false
   * - custom 模式下 resolve 为 undefined
   */
  const handleCancel = () => {
    void requestClose('cancel', req.variant === 'confirm' ? false : undefined);
  };

  /**
   * 处理“确定”按钮点击：
   * - 默认行为：confirm 模式返回 true，custom 模式返回 undefined
   * - 若注册了 confirmHandler，则先执行 handler 再尝试关闭
   */
  const handleConfirm = async () => {
    if (submitting) return;
    if (confirmDisabled) return;

    // 默认行为：confirm -> true；custom -> undefined
    const defaultResult = req.variant === 'confirm' ? true : undefined;
    const handler = confirmHandlerRef.current;
    if (!handler) {
      void requestClose('confirm', defaultResult);
      return;
    }

    try {
      setSubmitting(true);
      await handler();
      await requestClose('confirm', defaultResult);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 2147483647 }}
      aria-modal="true"
      role="dialog"
    >
      <div
        className={[
          'absolute inset-0 bg-black/45 backdrop-blur-[2px]',
          leaving
            ? 'motion-safe:animate-none motion-reduce:animate-none'
            : 'motion-safe:animate-[vizonMaskIn_140ms_ease-out] motion-reduce:animate-none'
        ].join(' ')}
        onMouseDown={() => {
          if (req.closeOnMask) void requestClose('mask', undefined);
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className={[
            'w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-[var(--border-subtle)]',
            'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xl',
            leaving
              ? 'motion-safe:animate-[vizonDialogOut_180ms_ease-in] motion-reduce:animate-none'
              : 'motion-safe:animate-[vizonDialogIn_180ms_ease-out] motion-reduce:animate-none'
          ].join(' ')}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(req.title || req.content || req.renderBody) ? (
            <div className="p-5">
              {req.title ? <div className="text-sm font-semibold tracking-tight">{req.title}</div> : null}
              {req.content ? (
                <div className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{req.content}</div>
              ) : null}
              {req.renderBody ? <div className="mt-3">{req.renderBody(bodyCtx)}</div> : null}
            </div>
          ) : null}

          <div className="h-px bg-[var(--border-subtle)]" />
          <div className="flex items-center justify-end gap-2 p-4">
            <button
              type="button"
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60"
              disabled={submitting}
              onClick={handleCancel}
            >
              {req.cancelText ?? t.cancel}
            </button>
            <button
              type="button"
              disabled={submitting || confirmDisabled}
              className={[
                'rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors disabled:opacity-60',
                req.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-[var(--accent)] hover:bg-[var(--accent-strong)]'
              ].join(' ')}
              onClick={handleConfirm}
            >
              {submitting ? confirmLoadingText ?? t.processing : req.confirmText ?? t.confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GlobalDialogProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Array<{ req: DialogRequest; resolve: (v?: unknown) => void }>>([]);

  /**
   * 提供给外部使用的全局对话框 API 实现。
   * - 通过维护栈结构实现多对话框管理（只展示栈顶）
   */
  const api = useMemo<Controller>(
    () => ({
      open: (req) => {
        const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        return new Promise((resolve) => {
          setStack((prev) => [...prev, { req: { ...req, id }, resolve }]);
        });
      },
      closeAll: () => {
        setStack((prev) => {
          for (const item of prev) item.resolve(undefined);
          return [];
        });
      }
    }),
    []
  );

  useEffect(() => {
    controller = api;
    return () => {
      if (controller === api) controller = null;
    };
  }, [api]);

  const top = stack[stack.length - 1];

  return (
    <Fragment>
      {children}
      {typeof document !== 'undefined' && top
        ? createPortal(
          <DialogShell
            req={top.req}
            onResolve={(result) => {
              top.resolve(result);
              setStack((prev) => prev.filter((x) => x.req.id !== top.req.id));
            }}
          />,
          document.body
        )
        : null}
    </Fragment>
  );
}

