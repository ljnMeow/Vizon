import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalMessageProvider, message } from '../GlobalMessage';

afterEach(async () => {
  message.hide();
  // 等待 leave 动画（170ms）完成后再清理 DOM
  await new Promise((r) => setTimeout(r, 200));
  cleanup();
});

describe('GlobalMessage', () => {
  it('shows success toast', async () => {
    render(
      <GlobalMessageProvider>
        <button type="button" onClick={() => void message.success('success-msg')}>btn</button>
      </GlobalMessageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'btn' }));
    await waitFor(() => {
      expect(screen.getByText('success-msg')).toBeInTheDocument();
    });
  });

  it('shows error toast', async () => {
    render(
      <GlobalMessageProvider>
        <button type="button" onClick={() => void message.error('error-msg')}>btn</button>
      </GlobalMessageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'btn' }));
    await waitFor(() => {
      expect(screen.getByText('error-msg')).toBeInTheDocument();
    });
  });

  it('shows info and warning toasts simultaneously', async () => {
    render(
      <GlobalMessageProvider>
        <button type="button" onClick={() => { void message.info('info-msg'); void message.warning('warn-msg'); }}>btn</button>
      </GlobalMessageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'btn' }));
    await waitFor(() => {
      expect(screen.getByText('info-msg')).toBeInTheDocument();
      expect(screen.getByText('warn-msg')).toBeInTheDocument();
    });
  });

  it('shows loading toast with aria-busy', async () => {
    render(
      <GlobalMessageProvider>
        <button type="button" onClick={() => message.loading('loading-msg')}>btn</button>
      </GlobalMessageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'btn' }));
    await waitFor(() => {
      expect(screen.getByText('loading-msg')).toBeInTheDocument();
    });
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('updates loading text and progress via handle', async () => {
    let handle: ReturnType<typeof message.loading> | undefined;
    render(
      <GlobalMessageProvider>
        <button type="button" onClick={() => { handle = message.loading('init'); }}>btn</button>
      </GlobalMessageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'btn' }));
    await waitFor(() => expect(screen.getByText('init')).toBeInTheDocument());

    handle!.update({ text: 'updated', progress: 50 });
    await waitFor(() => {
      expect(screen.getByText('updated')).toBeInTheDocument();
    });
    const bar = document.querySelector('[style*="width: 50%"]');
    expect(bar).toBeTruthy();
  });

  it('hides loading toast via handle.hide()', async () => {
    let handle: ReturnType<typeof message.loading> | undefined;
    render(
      <GlobalMessageProvider>
        <button type="button" onClick={() => { handle = message.loading('will-hide'); }}>btn</button>
      </GlobalMessageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'btn' }));
    await waitFor(() => expect(screen.getByText('will-hide')).toBeInTheDocument());

    handle!.hide();
    await waitFor(() => {
      expect(screen.queryByText('will-hide')).not.toBeInTheDocument();
    });
  });

  it('wraps long text instead of truncating', async () => {
    const longText = 'A'.repeat(200);
    render(
      <GlobalMessageProvider>
        <button type="button" onClick={() => void message.success(longText)}>btn</button>
      </GlobalMessageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'btn' }));
    await waitFor(() => {
      const el = screen.getByText(longText);
      expect(el).toBeInTheDocument();
      expect(el.className).toContain('break-words');
      expect(el.className).not.toContain('truncate');
    });
  });

  it('auto-hides success toast after duration', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <GlobalMessageProvider>
        <button type="button" onClick={() => void message.success('auto-hide', { durationMs: 500 })}>btn</button>
      </GlobalMessageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'btn' }));

    // 等待 toast 出现
    await waitFor(() => expect(screen.getByText('auto-hide')).toBeInTheDocument(), { timeout: 2000 });

    vi.advanceTimersByTime(700);
    await waitFor(() => expect(screen.queryByText('auto-hide')).not.toBeInTheDocument(), { timeout: 2000 });
    vi.useRealTimers();
  });
});
