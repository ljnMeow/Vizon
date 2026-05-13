/** `executeWithHistoryNotify` 顺序。 */
import { describe, expect, it, vi } from 'vitest';

import { HistoryManager } from '../HistoryManager';
import { executeWithHistoryNotify } from '../executeWithHistoryNotify';

describe('executeWithHistoryNotify', () => {
  it('先 execute 再 notify', async () => {
    const history = new HistoryManager(10);
    const order: string[] = [];
    const origExecute = history.execute.bind(history);
    vi.spyOn(history, 'execute').mockImplementation(async (op) => {
      order.push('exec');
      return origExecute(op);
    });
    const notify = vi.fn(() => order.push('notify'));
    await executeWithHistoryNotify(
      history,
      {
        name: 't',
        do: () => {},
        undo: () => {}
      },
      notify
    );
    expect(order).toEqual(['exec', 'notify']);
    expect(notify).toHaveBeenCalledOnce();
  });
});
