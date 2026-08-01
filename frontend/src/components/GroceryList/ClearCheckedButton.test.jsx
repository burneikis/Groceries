import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ClearCheckedButton from './ClearCheckedButton';
import useStore from '../../store/useStore';

let deleteCheckedItems;

beforeEach(() => {
  deleteCheckedItems = vi.fn().mockResolvedValue(undefined);
  useStore.setState({ deleteCheckedItems });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe('ClearCheckedButton', () => {
  it('shows how many items will be cleared', () => {
    render(<ClearCheckedButton count={3} />);
    expect(screen.getByRole('button')).toHaveTextContent('Clear 3 checked');
  });

  it('asks for confirmation before deleting', async () => {
    const user = userEvent.setup();
    render(<ClearCheckedButton count={2} />);

    await user.click(screen.getByRole('button'));

    expect(window.confirm).toHaveBeenCalledWith('Clear 2 checked items?');
  });

  it('uses the singular form in the confirmation for one item', async () => {
    const user = userEvent.setup();
    render(<ClearCheckedButton count={1} />);

    await user.click(screen.getByRole('button'));

    expect(window.confirm).toHaveBeenCalledWith('Clear 1 checked item?');
  });

  it('does nothing when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<ClearCheckedButton count={2} />);

    await user.click(screen.getByRole('button'));

    expect(deleteCheckedItems).not.toHaveBeenCalled();
  });

  it('clears the items once confirmed', async () => {
    const user = userEvent.setup();
    render(<ClearCheckedButton count={2} />);

    await user.click(screen.getByRole('button'));

    expect(deleteCheckedItems).toHaveBeenCalledTimes(1);
  });

  it('re-enables itself if the delete fails', async () => {
    deleteCheckedItems.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<ClearCheckedButton count={2} />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  });

  it('disables itself while the delete is in flight', async () => {
    let resolve;
    deleteCheckedItems.mockReturnValue(new Promise((r) => { resolve = r; }));
    const user = userEvent.setup();
    render(<ClearCheckedButton count={2} />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toBeDisabled();

    resolve();
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  });
});
