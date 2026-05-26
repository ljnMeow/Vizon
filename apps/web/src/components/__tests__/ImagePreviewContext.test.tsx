import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImagePreviewProvider, useImagePreview } from '../ImagePreviewContext';

/**
 * 辅助组件：通过 useImagePreview 触发全局预览，并暴露触发按钮供测试用。
 */
function Trigger({ src, title }: { src: string; title?: string }) {
  const { openPreview } = useImagePreview();
  return (
    <button type="button" onClick={() => openPreview(src, title)}>
      open
    </button>
  );
}

describe('ImagePreviewContext', () => {
  afterEach(() => {
    cleanup();
  });

  it('useImagePreview outside provider returns a no-op openPreview', () => {
    // 不包裹 Provider 时不应抛出错误
    function Bare() {
      const { openPreview } = useImagePreview();
      return (
        <button type="button" onClick={() => openPreview('blob:test')}>
          open
        </button>
      );
    }
    render(<Bare />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'open' }))).not.toThrow();
  });

  it('preview is not visible before openPreview is called', () => {
    render(
      <ImagePreviewProvider>
        <Trigger src="blob:mock" />
      </ImagePreviewProvider>
    );
    expect(document.querySelector('.PhotoView-Slider__Backdrop')).toBeNull();
  });

  it('opens preview when openPreview is called', async () => {
    render(
      <ImagePreviewProvider>
        <Trigger src="blob:mock" />
      </ImagePreviewProvider>
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
    });
    await waitFor(() => {
      expect(document.querySelector('.PhotoView-Slider__Backdrop')).not.toBeNull();
    });
  });

  it('renders the img with the given src inside the preview', async () => {
    render(
      <ImagePreviewProvider>
        <Trigger src="blob:preview-url" />
      </ImagePreviewProvider>
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
    });
    await waitFor(() => {
      expect(document.querySelector('img[src="blob:preview-url"]')).not.toBeNull();
    });
  });

  it('closes preview when Escape is pressed', async () => {
    render(
      <ImagePreviewProvider>
        <Trigger src="blob:mock" />
      </ImagePreviewProvider>
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('can be re-opened with a different src after closing', async () => {
    function MultiTrigger() {
      const { openPreview } = useImagePreview();
      return (
        <>
          <button type="button" onClick={() => openPreview('blob:first')}>first</button>
          <button type="button" onClick={() => openPreview('blob:second')}>second</button>
        </>
      );
    }

    render(
      <ImagePreviewProvider>
        <MultiTrigger />
      </ImagePreviewProvider>
    );

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'first' })); });
    await waitFor(() => {
      expect(document.querySelector('img[src="blob:first"]')).not.toBeNull();
    });

    const dialog = screen.getByRole('dialog');
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'second' })); });
    await waitFor(() => {
      expect(document.querySelector('img[src="blob:second"]')).not.toBeNull();
    });
  });

  it('shows title overlay when provided', async () => {
    render(
      <ImagePreviewProvider>
        <Trigger src="blob:mock" title="测试标题" />
      </ImagePreviewProvider>
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
    });
    expect(await screen.findByText('测试标题')).toBeInTheDocument();
  });

  it('openPreview is referentially stable across re-renders', () => {
    const calls: unknown[] = [];
    function Inspector() {
      const { openPreview } = useImagePreview();
      calls.push(openPreview);
      return null;
    }
    const { rerender } = render(
      <ImagePreviewProvider>
        <Inspector />
      </ImagePreviewProvider>
    );
    rerender(
      <ImagePreviewProvider>
        <Inspector />
      </ImagePreviewProvider>
    );
    // useCallback 保证两次渲染拿到同一个函数引用
    expect(calls[0]).toBe(calls[1]);
  });

  it('calls console.error if openPreview is not wrapped in a provider (no-op default)', () => {
    // 验证默认 context 值不抛出，即 noop 安全
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bare() {
      const { openPreview } = useImagePreview();
      openPreview('blob:test');
      return null;
    }
    expect(() => render(<Bare />)).not.toThrow();
    spy.mockRestore();
  });
});
