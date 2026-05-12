import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../../utils/keys';
import { ImagePreviewDialog } from '../ImagePreviewDialog';

describe('ImagePreviewDialog', () => {
  beforeEach(() => {
    window.localStorage.setItem(STORAGE_KEYS.LOCALE, 'zh-CN');
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
});
