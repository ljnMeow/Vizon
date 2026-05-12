import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../hooks/useLocale';
import { dialog, GlobalDialogProvider } from '../GlobalDialog';

describe('GlobalDialog', () => {
  it('opens confirm dialog and shows title', async () => {
    render(
      <LocaleProvider>
        <GlobalDialogProvider>
          <button type="button" onClick={() => void dialog.confirm({ title: 'Confirm title', content: 'Body' })}>
            open
          </button>
        </GlobalDialogProvider>
      </LocaleProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await waitFor(() => {
      expect(screen.getByText('Confirm title')).toBeInTheDocument();
      expect(screen.getByText('Body')).toBeInTheDocument();
    });
  });
});
