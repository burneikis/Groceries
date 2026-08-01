import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OfflineIndicator from './OfflineIndicator';
import useStore from '../store/useStore';

const setStatus = (isOnline, pendingSyncs) => useStore.setState({ isOnline, pendingSyncs });

describe('OfflineIndicator', () => {
  it('renders nothing when online and fully synced', () => {
    setStatus(true, 0);
    const { container } = render(<OfflineIndicator />);

    expect(container).toBeEmptyDOMElement();
  });

  it('announces that the user is offline', () => {
    setStatus(false, 0);
    render(<OfflineIndicator />);

    expect(screen.getByText('You are offline')).toBeInTheDocument();
  });

  it('shows the pending count once back online', () => {
    setStatus(true, 3);
    render(<OfflineIndicator />);

    expect(screen.getByText('Syncing 3 pending changes...')).toBeInTheDocument();
  });

  it('uses the singular form for a single pending change', () => {
    setStatus(true, 1);
    render(<OfflineIndicator />);

    expect(screen.getByText('Syncing 1 pending change...')).toBeInTheDocument();
  });

  it('prefers the offline message over the pending count while offline', () => {
    setStatus(false, 2);
    render(<OfflineIndicator />);

    expect(screen.getByText('You are offline')).toBeInTheDocument();
    expect(screen.queryByText(/Syncing/)).not.toBeInTheDocument();
  });
});
