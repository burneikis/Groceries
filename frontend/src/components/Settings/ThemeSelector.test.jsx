import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ThemeSelector from './ThemeSelector';
import useStore from '../../store/useStore';

let setTheme;

beforeEach(() => {
  setTheme = vi.fn();
  useStore.setState({ setTheme, theme: 'system' });
});

afterEach(() => vi.restoreAllMocks());

describe('ThemeSelector', () => {
  it('offers light, dark and system', () => {
    render(<ThemeSelector />);

    for (const label of ['Light', 'Dark', 'System']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('selects the theme that was clicked', async () => {
    const user = userEvent.setup();
    render(<ThemeSelector />);

    await user.click(screen.getByText('Dark'));

    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('highlights the active theme', () => {
    useStore.setState({ theme: 'dark' });
    render(<ThemeSelector />);

    const active = screen.getByText('Dark').closest('button');
    expect(active.className).toContain('border-amber-500');
  });

  it('does not highlight the inactive options', () => {
    useStore.setState({ theme: 'dark' });
    render(<ThemeSelector />);

    const inactive = screen.getByText('Light').closest('button');
    expect(inactive.className).not.toContain('border-amber-500');
  });

  it('lets every option be chosen', async () => {
    const user = userEvent.setup();
    render(<ThemeSelector />);

    for (const [label, value] of [['Light', 'light'], ['Dark', 'dark'], ['System', 'system']]) {
      await user.click(screen.getByText(label));
      expect(setTheme).toHaveBeenCalledWith(value);
    }
  });
});
