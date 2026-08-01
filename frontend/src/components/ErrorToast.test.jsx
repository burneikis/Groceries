import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ErrorToast from './ErrorToast';
import useStore from '../store/useStore';

let clearError;

beforeEach(() => {
  clearError = vi.fn(() => useStore.setState({ error: null }));
  useStore.setState({ error: null, clearError });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ErrorToast', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<ErrorToast />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current error message', () => {
    useStore.setState({ error: 'Item not found' });
    render(<ErrorToast />);

    expect(screen.getByText('Item not found')).toBeInTheDocument();
  });

  it('clears the error when dismissed', async () => {
    useStore.setState({ error: 'Item not found' });
    const user = userEvent.setup();
    render(<ErrorToast />);

    await user.click(screen.getByRole('button'));

    expect(clearError).toHaveBeenCalled();
  });

  it('auto-dismisses after five seconds', () => {
    vi.useFakeTimers();
    useStore.setState({ error: 'Transient failure' });
    render(<ErrorToast />);

    expect(clearError).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(5000));

    expect(clearError).toHaveBeenCalled();
  });

  it('does not fire the timer after unmounting', () => {
    vi.useFakeTimers();
    useStore.setState({ error: 'Transient failure' });
    const { unmount } = render(<ErrorToast />);

    unmount();
    act(() => vi.advanceTimersByTime(10000));

    expect(clearError).not.toHaveBeenCalled();
  });
});
