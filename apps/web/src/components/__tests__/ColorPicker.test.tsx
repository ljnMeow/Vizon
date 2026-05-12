import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorPicker } from '../ColorPicker';

describe('ColorPicker', () => {
  it('calls onChange when color input changes', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#ff0000" onChange={onChange} ariaLabel="pick-color" showValue />);
    expect(screen.getByText('#ff0000')).toBeInTheDocument();
    const input = screen.getByLabelText('pick-color');
    fireEvent.change(input, { target: { value: '#00ff00' } });
    expect(onChange).toHaveBeenCalledWith('#00ff00');
  });
});
