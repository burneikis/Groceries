import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CategoryRow from './CategoryRow';
import useStore from '../../store/useStore';

let updateCategory;
let deleteCategory;

const category = { id: 1, name: 'Dairy & Eggs', sort_order: 1 };

const renderRow = (cat = category) =>
  render(
    <DndContext>
      <SortableContext items={[cat.id]}>
        <CategoryRow category={cat} />
      </SortableContext>
    </DndContext>
  );

beforeEach(() => {
  updateCategory = vi.fn().mockResolvedValue(undefined);
  deleteCategory = vi.fn().mockResolvedValue(undefined);
  useStore.setState({ updateCategory, deleteCategory });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('renaming', () => {
  it('opens an editor when the name is clicked', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByText('Dairy & Eggs'));

    expect(screen.getByDisplayValue('Dairy & Eggs')).toBeInTheDocument();
  });

  it('saves the trimmed name on Enter', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByText('Dairy & Eggs'));
    const input = screen.getByDisplayValue('Dairy & Eggs');
    await user.clear(input);
    await user.type(input, '  Dairy  {Enter}');

    expect(updateCategory).toHaveBeenCalledWith(1, 'Dairy');
  });

  it('saves on blur', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByText('Dairy & Eggs'));
    const input = screen.getByDisplayValue('Dairy & Eggs');
    await user.clear(input);
    await user.type(input, 'Dairy');
    await user.tab();

    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith(1, 'Dairy'));
  });

  it('skips the request when the name is unchanged', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByText('Dairy & Eggs'));
    await user.keyboard('{Enter}');

    expect(updateCategory).not.toHaveBeenCalled();
  });

  it('skips the request when the name is cleared', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByText('Dairy & Eggs'));
    await user.clear(screen.getByDisplayValue('Dairy & Eggs'));
    await user.keyboard('{Enter}');

    expect(updateCategory).not.toHaveBeenCalled();
  });

  it('abandons the edit on Escape', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByText('Dairy & Eggs'));
    await user.type(screen.getByDisplayValue('Dairy & Eggs'), 'xyz{Escape}');

    expect(updateCategory).not.toHaveBeenCalled();
    expect(screen.getByText('Dairy & Eggs')).toBeInTheDocument();
  });

  it('restores the previous name when the save fails', async () => {
    updateCategory.mockRejectedValue(new Error('Name already exists'));
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByText('Dairy & Eggs'));
    const input = screen.getByDisplayValue('Dairy & Eggs');
    await user.clear(input);
    await user.type(input, 'Bakery{Enter}');

    await waitFor(() => expect(screen.getByDisplayValue('Dairy & Eggs')).toBeInTheDocument());
  });
});

describe('deleting', () => {
  const deleteButton = () => {
    const buttons = screen.getAllByRole('button');
    return buttons[buttons.length - 1];
  };

  it('confirms before deleting', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(deleteButton());

    expect(window.confirm).toHaveBeenCalledWith('Delete "Dairy & Eggs"?');
    expect(deleteCategory).toHaveBeenCalledWith(1);
  });

  it('does nothing when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderRow();

    await user.click(deleteButton());

    expect(deleteCategory).not.toHaveBeenCalled();
  });

  it('surfaces the failure and re-enables the button', async () => {
    deleteCategory.mockRejectedValue(new Error('Category in use'));
    const user = userEvent.setup();
    renderRow();

    await user.click(deleteButton());

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Category in use'));
    expect(deleteButton()).toBeEnabled();
  });
});
