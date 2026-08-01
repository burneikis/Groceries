import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AddItemForm from './AddItemForm';
import useStore from '../../store/useStore';

let createItem;

beforeEach(() => {
  createItem = vi.fn().mockResolvedValue({ id: 1 });
  useStore.setState({ createItem });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const nameInput = () => screen.getByPlaceholderText('Add an item...');
const addButton = () => screen.getByRole('button', { name: /add$/i });

describe('AddItemForm', () => {
  it('disables the submit button until a name is entered', async () => {
    const user = userEvent.setup();
    render(<AddItemForm />);

    expect(addButton()).toBeDisabled();

    await user.type(nameInput(), 'Milk');
    expect(addButton()).toBeEnabled();
  });

  it('keeps the button disabled for whitespace-only input', async () => {
    const user = userEvent.setup();
    render(<AddItemForm />);

    await user.type(nameInput(), '   ');

    expect(addButton()).toBeDisabled();
  });

  it('creates the item with a trimmed name', async () => {
    const user = userEvent.setup();
    render(<AddItemForm />);

    await user.type(nameInput(), '  Milk  ');
    await user.click(addButton());

    expect(createItem).toHaveBeenCalledWith({ name: 'Milk', amount: undefined });
  });

  it('submits on Enter', async () => {
    const user = userEvent.setup();
    render(<AddItemForm />);

    await user.type(nameInput(), 'Milk{Enter}');

    await waitFor(() => expect(createItem).toHaveBeenCalled());
  });

  it('includes the amount once the quantity field is revealed', async () => {
    const user = userEvent.setup();
    render(<AddItemForm />);

    await user.click(screen.getByTitle('Add quantity'));
    await user.type(nameInput(), 'Milk');
    await user.type(screen.getByPlaceholderText('Qty'), '2L');
    await user.click(addButton());

    expect(createItem).toHaveBeenCalledWith({ name: 'Milk', amount: '2L' });
  });

  it('resets the form after a successful add', async () => {
    const user = userEvent.setup();
    render(<AddItemForm />);

    await user.type(nameInput(), 'Milk');
    await user.click(addButton());

    await waitFor(() => expect(nameInput()).toHaveValue(''));
    expect(screen.queryByPlaceholderText('Qty')).not.toBeInTheDocument();
  });

  it('keeps the typed name when the add fails, so nothing is lost', async () => {
    createItem.mockRejectedValue(new Error('server exploded'));
    const user = userEvent.setup();
    render(<AddItemForm />);

    await user.type(nameInput(), 'Milk');
    await user.click(addButton());

    await waitFor(() => expect(addButton()).toBeEnabled());
    expect(nameInput()).toHaveValue('Milk');
  });

  it('prevents a double submit while the request is in flight', async () => {
    let resolve;
    createItem.mockReturnValue(new Promise((r) => { resolve = r; }));
    const user = userEvent.setup();
    render(<AddItemForm />);

    await user.type(nameInput(), 'Milk');
    await user.click(addButton());

    expect(addButton()).toBeDisabled();

    resolve({ id: 1 });
    await waitFor(() => expect(nameInput()).toHaveValue(''));
    expect(createItem).toHaveBeenCalledTimes(1);
  });
});
