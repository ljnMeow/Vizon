import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Accordion } from '../Accordion';

describe('Accordion', () => {
  it('renders items and toggles panel via header button', () => {
    render(
      <Accordion
        items={[
          {
            key: 'p1',
            header: 'Section title',
            content: <div>Hidden body</div>,
          },
        ]}
      />
    );
    expect(screen.getByRole('button', { name: 'Section title' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Section title' }));
    expect(screen.getByRole('button', { name: 'Section title' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hidden body')).toBeInTheDocument();
  });
});
