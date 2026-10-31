import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RecurringManager from './RecurringManager';
import useStore from '../../store/useStore';
import { itemsApi } from '../../services/api';

let createRecurringItem;
let updateRecurringItem;
let deleteRecurringItem;

const milk = { id: 1, name: 'Milk', amount: '2L', category_id: 1 };
const bread = { id: 2, name: 'Bread', amount: null, category_id: 2 };

beforeEach(() => {
  createRecurringItem = vi.fn().mockResolvedValue({ id: 3 });
  updateRecurringItem = vi.fn().mockResolvedValue(undefined);
  deleteRecurringItem = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    categories: [
      { id: 1, name: 'Dairy & Eggs', sort_order: 2 },
      { id: 2, name: 'Bakery', sort_order: 1 },
    ],
    recurringItems: [milk, bread],
    createRecurringItem,
    updateRecurringItem,
    deleteRecurringItem,
  });
  vi.spyOn(itemsApi, 'suggestCategory').mockResolvedValue({ category_id: null });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const nameInput = () => screen.getAllByRole('textbox', { name: 'Recurring item name' })[0];

describe('RecurringManager', () => {
  it('lists recurring items in category order', () => {
    render(<RecurringManager />);

    const rows = screen.getAllByRole('button', { name: /Milk|Bread/ })
      .filter((b) => !b.getAttribute('aria-label'));
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Bread'),
      expect.stringContaining('Milk'),
    ]);
  });

  it('adds a recurring item and clears the form', async () => {
    const user = userEvent.setup();
    render(<RecurringManager />);

    await user.type(nameInput(), ' Cereal ');
    await user.type(screen.getByRole('textbox', { name: 'Quantity' }), '1 box');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(createRecurringItem).toHaveBeenCalledWith({
      name: 'Cereal',
      amount: '1 box',
      category_id: null,
    });
    await waitFor(() => expect(nameInput()).toHaveValue(''));
  });

  it('suggests a category when the name loses focus', async () => {
    itemsApi.suggestCategory.mockResolvedValue({ category_id: 2 });
    const user = userEvent.setup();
    render(<RecurringManager />);

    await user.type(nameInput(), 'Rolls');
    await user.tab();

    await waitFor(() =>
      expect(screen.getAllByRole('combobox', { name: 'Category' })[0]).toHaveValue('2')
    );
  });

  it('rejects a duplicate name inline without saving', async () => {
    const user = userEvent.setup();
    render(<RecurringManager />);

    await user.type(nameInput(), 'breads');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('alert')).toHaveTextContent('"Bread" is already a recurring item');
    expect(createRecurringItem).not.toHaveBeenCalled();
  });

  it('shows a server error inline', async () => {
    createRecurringItem.mockRejectedValue(new Error('Server says no'));
    const user = userEvent.setup();
    render(<RecurringManager />);

    await user.type(nameInput(), 'Cereal');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server says no');
  });

  it('edits a recurring item inline', async () => {
    const user = userEvent.setup();
    render(<RecurringManager />);

    await user.click(screen.getByText('Milk'));
    const quantity = screen.getAllByRole('textbox', { name: 'Quantity' })[1];
    await user.clear(quantity);
    await user.type(quantity, '1L');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateRecurringItem).toHaveBeenCalledWith(1, {
      name: 'Milk',
      amount: '1L',
      category_id: 1,
    });
  });

  it('deletes after confirmation', async () => {
    const user = userEvent.setup();
    render(<RecurringManager />);

    await user.click(screen.getByRole('button', { name: 'Delete Milk' }));

    expect(deleteRecurringItem).toHaveBeenCalledWith(1);
  });

  it('explains what recurring items are for when there are none', () => {
    useStore.setState({ recurringItems: [] });
    render(<RecurringManager />);
    expect(screen.getByText(/dinner wizard/)).toBeInTheDocument();
  });
});
