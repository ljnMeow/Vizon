import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';
import { STORAGE_KEYS } from '../../utils/keys';

function Boom(): never {
  throw new Error('test render error');
}

describe('ErrorBoundary', () => {
  const original = window.localStorage;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: original });
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <span>ok</span>
      </ErrorBoundary>
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('renders default fallback in en-US when child throws', () => {
    window.localStorage.setItem(STORAGE_KEYS.LOCALE, 'en-US');
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });
});
