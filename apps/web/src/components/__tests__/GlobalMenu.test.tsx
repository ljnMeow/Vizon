import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GlobalMenu } from '../GlobalMenu';

function MenuHarness({
  open,
  onRequestClose,
}: {
  open: boolean;
  onRequestClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} data-testid="menu-shell">
      <GlobalMenu
        open={open}
        containerRef={ref}
        onRequestClose={onRequestClose}
        groups={[
          {
            key: 'g1',
            items: [{ key: 'i1', label: 'Action one', onClick: vi.fn() }],
          },
        ]}
      />
    </div>
  );
}

describe('GlobalMenu', () => {
  it('renders menu items when open', () => {
    const onClose = vi.fn();
    render(<MenuHarness open onRequestClose={onClose} />);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Action one' })).toBeInTheDocument();
  });

  it('calls onRequestClose when clicking outside container', () => {
    const onClose = vi.fn();
    render(
      <>
        <MenuHarness open onRequestClose={onClose} />
        <button type="button">outside</button>
      </>
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(onClose).toHaveBeenCalled();
  });
});
