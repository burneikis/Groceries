import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ItemRow from './ItemRow';
import useStore from '../../store/useStore';

let toggleItemCheck;
let deleteItem;
let updateItem;

const item = (overrides = {}) => ({
  id: 1,
  name: 'Milk',
  amount: null,
  description: null,
  recipe_name: null,
  category_id: 1,
  checked: 0,
  ...overrides,
});

/** ItemRow uses useSortable, which requires the dnd-kit context. */
const renderRow = (props) =>
  render(
    <DndContext>
      <SortableContext items={[props.item.id]}>
        <ItemRow {...props} />
      </SortableContext>
    </DndContext>
  );

beforeEach(() => {
  toggleItemCheck = vi.fn().mockResolvedValue(undefined);
  deleteItem = vi.fn().mockResolvedValue(undefined);
  updateItem = vi.fn().mockResolvedValue(undefined);
  useStore.setState({
    toggleItemCheck,
    deleteItem,
    updateItem,
    categories: [
      { id: 1, name: 'Dairy & Eggs', sort_order: 1 },
      { id: 2, name: 'Bakery', sort_order: 2 },
    ],
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('display', () => {
  it('renders the item name', () => {
    renderRow({ item: item() });
    expect(screen.getByText('Milk')).toBeInTheDocument();
  });

  it('renders the optional amount, description and recipe attribution', () => {
    renderRow({
      item: item({ amount: '2L', description: 'semi-skimmed', recipe_name: 'Pancakes' }),
    });

    expect(screen.getByText('2L')).toBeInTheDocument();
    expect(screen.getByText('semi-skimmed')).toBeInTheDocument();
    expect(screen.getByText('for Pancakes')).toBeInTheDocument();
  });

  it('marks items added as recurring', () => {
    renderRow({ item: item({ is_recurring: 1 }) });
    expect(screen.getByText('recurring')).toBeInTheDocument();
  });

  it('shows no recurring marker on ordinary items', () => {
    renderRow({ item: item({ is_recurring: 0 }) });
    expect(screen.queryByText('recurring')).not.toBeInTheDocument();
  });

  it('strikes through a checked item', () => {
    renderRow({ item: item({ checked: 1 }) });
    expect(screen.getByText('Milk').className).toContain('line-through');
  });
});

describe('checking', () => {
  it('checks immediately when it is the only item in its category', async () => {
    const user = userEvent.setup();
    renderRow({ item: item(), categoryItemCount: 1 });

    await user.click(screen.getAllByRole('button')[0]);

    expect(toggleItemCheck).toHaveBeenCalledWith(1, true);
  });

  it('unchecks immediately without waiting for an animation', async () => {
    const user = userEvent.setup();
    renderRow({ item: item({ checked: 1 }), categoryItemCount: 5 });

    await user.click(screen.getAllByRole('button')[0]);

    expect(toggleItemCheck).toHaveBeenCalledWith(1, false);
  });

  it('defers the check until the fade-out finishes when siblings exist', async () => {
    const user = userEvent.setup();
    renderRow({ item: item(), categoryItemCount: 3 });

    await user.click(screen.getAllByRole('button')[0]);
    expect(toggleItemCheck).not.toHaveBeenCalled(); // waiting out the animation

    await waitFor(() => expect(toggleItemCheck).toHaveBeenCalledWith(1, true));
  });
});

describe('deleting', () => {
  it('confirms before deleting', async () => {
    const user = userEvent.setup();
    renderRow({ item: item() });

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);

    expect(window.confirm).toHaveBeenCalledWith('Delete "Milk"?');
    expect(deleteItem).toHaveBeenCalledWith(1);
  });

  it('does not delete when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderRow({ item: item() });

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);

    expect(deleteItem).not.toHaveBeenCalled();
  });
});

describe('editing', () => {
  const openEditor = async (user, props = {}) => {
    renderRow({ item: item(), ...props });
    await user.click(screen.getByText('Milk'));
  };

  it('opens the editor when an unchecked item is clicked', async () => {
    const user = userEvent.setup();
    await openEditor(user);

    expect(screen.getByDisplayValue('Milk')).toBeInTheDocument();
  });

  it('does not open the editor for a checked item', async () => {
    const user = userEvent.setup();
    renderRow({ item: item({ checked: 1 }) });

    await user.click(screen.getByText('Milk'));

    expect(screen.queryByDisplayValue('Milk')).not.toBeInTheDocument();
  });

  it('saves the trimmed name, amount and category', async () => {
    const user = userEvent.setup();
    await openEditor(user);

    const nameField = screen.getByDisplayValue('Milk');
    await user.clear(nameField);
    await user.type(nameField, '  Oat milk  ');
    await user.type(screen.getByPlaceholderText('Qty'), '1L');
    await user.selectOptions(screen.getByRole('combobox'), '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateItem).toHaveBeenCalledWith(1, {
      name: 'Oat milk',
      amount: '1L',
      category_id: 2,
    });
  });

  it('sends a null category when "No category" is chosen', async () => {
    const user = userEvent.setup();
    await openEditor(user);

    await user.selectOptions(screen.getByRole('combobox'), '');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateItem).toHaveBeenCalledWith(1, expect.objectContaining({ category_id: null }));
  });

  it('refuses to save a blank name', async () => {
    const user = userEvent.setup();
    await openEditor(user);

    await user.clear(screen.getByDisplayValue('Milk'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateItem).not.toHaveBeenCalled();
  });

  it('closes the editor after a successful save', async () => {
    const user = userEvent.setup();
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
  });

  it('stays open so edits are not lost when the save fails', async () => {
    updateItem.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('discards changes on cancel', async () => {
    const user = userEvent.setup();
    await openEditor(user);

    await user.type(screen.getByDisplayValue('Milk'), 'shake');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(updateItem).not.toHaveBeenCalled();
    expect(screen.getByText('Milk')).toBeInTheDocument();
  });
});
