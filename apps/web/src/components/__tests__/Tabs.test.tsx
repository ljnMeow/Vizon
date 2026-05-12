import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from '../Tabs';

describe('Tabs', () => {
  it('shows active tab content and invokes onChange when clicking another tab', () => {
    const onChange = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <Tabs
        tabs={[
          { key: 'a', label: 'Tab A' },
          { key: 'b', label: 'Tab B' },
        ]}
        activeKey="a"
        onChange={onChange}
        showTooltip={false}
      >
        {(key) => <div>Content-{key}</div>}
      </Tabs>
    );
    expect(screen.getByText('Content-a')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tab B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
