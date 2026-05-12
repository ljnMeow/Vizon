import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GlobalMessageProvider, message } from '../GlobalMessage';

describe('GlobalMessage', () => {
  it('shows toast text after message.success', async () => {
    render(
      <GlobalMessageProvider>
        <button type="button" onClick={() => void message.success('hello-toast')}>
          trigger
        </button>
      </GlobalMessageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));
    await waitFor(() => {
      expect(screen.getByText('hello-toast')).toBeInTheDocument();
    });
  });
});
