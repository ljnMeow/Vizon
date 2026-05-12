import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from '../Select';

describe('Select', () => {
  it('renders options and reports changes', () => {
    const onChange = vi.fn();
    render(
      <Select
        value="b"
        onChange={onChange}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
        ariaLabel="pick"
      />
    );
    expect(screen.getByLabelText('pick')).toHaveValue('b');
    fireEvent.change(screen.getByLabelText('pick'), { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalledWith('a');
  });
});
