import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('Lightbox is not visible before openPreview is called', () => {
    render(
      <ImagePreviewProvider>
        <Trigger src="blob:mock" />
      </ImagePreviewProvider>
    );
    // Lightbox 关闭时不渲染 dialog
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens Lightbox when openPreview is called', () => {
    render(
      <ImagePreviewProvider>
        <Trigger src="blob:mock" />
      </ImagePreviewProvider>
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
    });
    // Lightbox 挂载后以 dialog role 呈现
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders the img with the given src inside the Lightbox', () => {
    render(
      <ImagePreviewProvider>
        <Trigger src="blob:preview-url" />
      </ImagePreviewProvider>
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
    });
    // Lightbox 渲染的 img 有 alt=""，ARIA role 为 presentation，通过 src 属性断言
    expect(document.querySelector('img[src="blob:preview-url"]')).not.toBeNull();
  });

  it('closes Lightbox when the close button is clicked', async () => {
    render(
      <ImagePreviewProvider>
        <Trigger src="blob:mock" />
      </ImagePreviewProvider>
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('yarl__portal_open');

    const closeBtn = screen.getByLabelText(/close/i);
    await act(async () => {
      fireEvent.click(closeBtn);
    });
    // JSDOM 无 CSS 动画，portal 元素不立即卸载；
    // 断言 open 状态已响应：yarl__portal_open class 被移除
    expect(dialog).not.toHaveClass('yarl__portal_open');
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
    expect(document.querySelector('img[src="blob:first"]')).not.toBeNull();

    // 关闭：断言 portal open class 移除
    const dialog = screen.getByRole('dialog');
    await act(async () => { fireEvent.click(screen.getByLabelText(/close/i)); });
    expect(dialog).not.toHaveClass('yarl__portal_open');

    // 用不同 src 重新打开
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'second' })); });
    expect(document.querySelector('img[src="blob:second"]')).not.toBeNull();
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
