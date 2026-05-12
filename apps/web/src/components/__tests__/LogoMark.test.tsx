import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LogoMark from '../LogoMark';

describe('LogoMark', () => {
  it('renders svg brand mark', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('path')).toBeTruthy();
  });
});
