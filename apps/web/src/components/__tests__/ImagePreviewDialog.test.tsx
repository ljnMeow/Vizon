import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../../utils/keys';
import { ImagePreviewDialog } from '../ImagePreviewDialog';

describe('ImagePreviewDialog', () => {
  beforeEach(() => {
    window.localStorage.setItem(STORAGE_KEYS.LOCALE, 'zh-CN');
  });

  afterEach(() => {
    cleanup();
  });

  it('shows unsupported hint when fileUrl is null', () => {
    render(
      <ImagePreviewDialog
        open
        fileUrl={null}
        title="Preview"
        loadingText="Loading"
        closeText="Close"
        onClose={() => {}}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('暂不支持预览此文件类型。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('shows loading text and hides image container while image is loading', () => {
    render(
      <ImagePreviewDialog
        open
        fileUrl="blob:mock-url"
        title="Preview"
        loadingText="Loading..."
        closeText="Close"
        onClose={() => {}}
      />
    );

    // 加载中：loading 文案可见
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    // img 元素在 DOM 中（因为要接收 onLoad/onError）但图片容器被 hidden 隐藏
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toBeInTheDocument();
    expect(img.closest('.hidden')).toBeTruthy();
  });

  it('resolves loading state and shows image after onLoad fires', () => {
    render(
      <ImagePreviewDialog
        open
        fileUrl="blob:mock-url"
        title="Preview"
        loadingText="Loading..."
        closeText="Close"
        onClose={() => {}}
      />
    );

    const img = screen.getByRole('img', { hidden: true });
    // 触发图片加载完成
    act(() => {
      fireEvent.load(img);
    });

    // 加载完成：loading 文案消失，图片容器可见
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByRole('img').closest('.hidden')).toBeFalsy();
  });

  it('shows error message and hides image after onError fires', () => {
    render(
      <ImagePreviewDialog
        open
        fileUrl="blob:invalid-url"
        title="Preview"
        loadingText="Loading..."
        errorText="Load failed"
        closeText="Close"
        onClose={() => {}}
      />
    );

    const img = screen.getByRole('img', { hidden: true });
    // 触发加载失败
    act(() => {
      fireEvent.error(img);
    });

    // 错误态：显示错误文案，img 容器已从 DOM 中移除
    expect(screen.getByText('Load failed')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('resets loading state when fileUrl changes', () => {
    const { rerender } = render(
      <ImagePreviewDialog
        open
        fileUrl="blob:url-1"
        title="Preview"
        loadingText="Loading..."
        closeText="Close"
        onClose={() => {}}
      />
    );

    // 先触发加载完成
    act(() => {
      fireEvent.load(screen.getByRole('img', { hidden: true }));
    });
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

    // fileUrl 变化 → 重置为加载中
    rerender(
      <ImagePreviewDialog
        open
        fileUrl="blob:url-2"
        title="Preview"
        loadingText="Loading..."
        closeText="Close"
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('does not render dialog when open is false', () => {
    render(
      <ImagePreviewDialog
        open={false}
        fileUrl="blob:mock-url"
        title="Preview"
        loadingText="Loading..."
        closeText="Close"
        onClose={() => {}}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    let closed = false;
    render(
      <ImagePreviewDialog
        open
        fileUrl={null}
        title="Preview"
        loadingText="Loading..."
        closeText="Close"
        onClose={() => { closed = true; }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });
});
