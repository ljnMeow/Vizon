import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextureMeta } from '../../api/textures';
import { listTextures } from '../../api/textures';
import { LocaleProvider } from '../../hooks/useLocale';
import { STORAGE_KEYS } from '../../utils/keys';
import { TexturePicker, type TexturePickerProps } from '../TexturePicker';

vi.mock('../../api/textures', () => ({
  listTextures: vi.fn(),
}));

const mockTexture: TextureMeta = {
  texture_id: 'tex-1',
  name: 'Wood',
  category: 'color_map',
  texture_slot: 'map',
  file_url: 'https://example.com/tex.png',
  thumbnail_url: 'https://example.com/thumb.png',
  file_size: 1024,
  mime_type: 'image/png',
  width: 512,
  height: 512,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

function renderTexturePicker(overrides: Partial<TexturePickerProps> = {}) {
  const onSelect = overrides.onSelect ?? vi.fn();
  const props: TexturePickerProps = {
    category: 'color_map',
    label: 'Select texture',
    onSelect,
    ...overrides,
  };
  const view = render(
    <LocaleProvider>
      <TexturePicker {...props} />
    </LocaleProvider>,
  );
  return { ...view, onSelect };
}

describe('TexturePicker', () => {
  beforeEach(() => {
    vi.mocked(listTextures).mockReset();
    vi.mocked(listTextures).mockResolvedValue([]);
    window.localStorage.setItem(STORAGE_KEYS.LOCALE, 'zh-CN');
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 100,
      left: 100,
      right: 200,
      bottom: 130,
      width: 100,
      height: 30,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    window.localStorage.removeItem(STORAGE_KEYS.LOCALE);
  });

  it('渲染触发按钮文案', () => {
    renderTexturePicker({ label: '选择贴图' });
    expect(screen.getByRole('button', { name: '选择贴图' })).toBeInTheDocument();
  });

  it('禁用时不会打开面板或请求列表', () => {
    renderTexturePicker({ disabled: true });
    fireEvent.click(screen.getByRole('button', { name: 'Select texture' }));
    expect(listTextures).not.toHaveBeenCalled();
    expect(screen.queryByText('暂无贴图')).not.toBeInTheDocument();
  });

  it('打开时按分类拉取贴图并展示列表', async () => {
    vi.mocked(listTextures).mockResolvedValue([mockTexture]);
    renderTexturePicker();

    fireEvent.click(screen.getByRole('button', { name: 'Select texture' }));

    await waitFor(() => {
      expect(listTextures).toHaveBeenCalledWith('color_map');
      expect(screen.getByText('Wood')).toBeInTheDocument();
    });
  });

  it('选择贴图后回调 onSelect 并关闭面板', async () => {
    vi.mocked(listTextures).mockResolvedValue([mockTexture]);
    const { onSelect } = renderTexturePicker();

    fireEvent.click(screen.getByRole('button', { name: 'Select texture' }));
    await waitFor(() => expect(screen.getByText('Wood')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Wood/ }));

    expect(onSelect).toHaveBeenCalledWith(mockTexture);
    await waitFor(() => {
      expect(screen.queryByText('Wood')).not.toBeInTheDocument();
    });
  });

  it('空列表时显示当前语言的默认空状态文案', async () => {
    renderTexturePicker();

    fireEvent.click(screen.getByRole('button', { name: 'Select texture' }));

    await waitFor(() => {
      expect(screen.getByText('暂无贴图')).toBeInTheDocument();
    });
  });

  it('英文环境下显示英文空状态文案', async () => {
    window.localStorage.setItem(STORAGE_KEYS.LOCALE, 'en-US');
    renderTexturePicker();

    fireEvent.click(screen.getByRole('button', { name: 'Select texture' }));

    await waitFor(() => {
      expect(screen.getByText('No textures')).toBeInTheDocument();
    });
  });

  it('emptyText 可覆盖默认 i18n 文案', async () => {
    renderTexturePicker({ emptyText: 'Custom empty' });

    fireEvent.click(screen.getByRole('button', { name: 'Select texture' }));

    await waitFor(() => {
      expect(screen.getByText('Custom empty')).toBeInTheDocument();
      expect(screen.queryByText('暂无贴图')).not.toBeInTheDocument();
    });
  });

  it('点击面板外部时关闭下拉', async () => {
    vi.mocked(listTextures).mockResolvedValue([mockTexture]);
    renderTexturePicker();

    fireEvent.click(screen.getByRole('button', { name: 'Select texture' }));
    await waitFor(() => expect(screen.getByText('Wood')).toBeInTheDocument());

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('Wood')).not.toBeInTheDocument();
    });
  });
});
