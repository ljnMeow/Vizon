import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tooltip } from '../Tooltip';

describe('Tooltip', () => {
  it('renders trigger children', () => {
    render(
      <Tooltip content="Help text" disabled>
        <button type="button">Hover me</button>
      </Tooltip>
    );
    expect(screen.getByRole('button', { name: 'Hover me' })).toBeInTheDocument();
  });
});
