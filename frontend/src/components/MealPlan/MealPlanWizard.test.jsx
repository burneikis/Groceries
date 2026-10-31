import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MealPlanWizard from './MealPlanWizard';
import useStore from '../../store/useStore';

const recipe = (id, name, ingredients, last_planned_at = null) => ({
  id,
  name,
  last_planned_at,
  ingredients: ingredients.map((ing, i) => ({ id: id * 100 + i, name: ing, amount: null })),
});

const chilli = recipe(1, 'Chilli', ['Beans', 'Mince']);
const curry = recipe(2, 'Curry', ['Rice', 'Beans']);
const pasta = recipe(3, 'Pasta', ['Pasta']);

let fetchMealPlanSuggestions;
let confirmMealPlan;

const renderWizard = () =>
  render(
    <MemoryRouter>
      <MealPlanWizard />
    </MemoryRouter>
  );

/** Walk the intro step and land on the suggestions list. */
const start = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Start' }));
  await screen.findByText('Chilli');
};

beforeEach(() => {
  sessionStorage.clear();
  fetchMealPlanSuggestions = vi
    .fn()
    .mockResolvedValue({ suggestions: [chilli, curry], pool: [chilli, curry, pasta] });
  confirmMealPlan = vi.fn().mockResolvedValue({ itemsAdded: 3, items: [], recipes: [] });

  useStore.setState({
    items: [],
    categories: [],
    recurringItems: [],
    fetchRecurringItems: vi.fn(),
    isOnline: true,
    mealPlan: { suggestions: [], pool: [], loading: false, error: null },
    fetchMealPlanSuggestions,
    confirmMealPlan,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('intro', () => {
  it('requests the chosen number of dinners', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: '5' }));
    await start(user);

    expect(fetchMealPlanSuggestions).toHaveBeenCalledWith(5);
  });

  it('disables Start while offline', () => {
    useStore.setState({ isOnline: false });
    renderWizard();

    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });
});

describe('suggestions', () => {
  it('swaps a suggestion for the next unused pool recipe', async () => {
    const user = userEvent.setup();
    renderWizard();
    await start(user);

    await user.click(screen.getAllByRole('button', { name: 'Swap' })[0]);

    expect(screen.queryByText('Chilli')).not.toBeInTheDocument();
    expect(screen.getByText('Pasta')).toBeInTheDocument();
  });

  it('does not immediately re-offer a recipe just swapped out', async () => {
    // Only two pool candidates beyond the initial selection: Pasta and
    // Beetroot. Swapping Chilli should offer Pasta, and swapping the same
    // slot again should move on to Beetroot rather than bouncing back to
    // Chilli, even though Chilli is stalest again once it leaves `selected`.
    const beetroot = recipe(4, 'Beetroot', ['Beetroot']);
    fetchMealPlanSuggestions.mockResolvedValue({
      suggestions: [chilli, curry],
      pool: [chilli, pasta, beetroot, curry],
    });

    const user = userEvent.setup();
    renderWizard();
    await start(user);

    await user.click(screen.getAllByRole('button', { name: 'Swap' })[0]);
    expect(screen.getByText('Pasta')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Swap' })[0]);
    expect(screen.queryByText('Pasta')).not.toBeInTheDocument();
    expect(screen.getByText('Beetroot')).toBeInTheDocument();
  });

  it('rotates through the whole pool once every option has been rejected', async () => {
    // One selected slot and a three-recipe pool, so repeated swaps exhaust
    // every candidate. Past that point recipes have to be re-offered, but the
    // least-recently-rejected one must come first: a naive "stalest first"
    // fallback ping-pongs between Chilli and Pasta and never offers Beetroot.
    const beetroot = recipe(4, 'Beetroot', ['Beetroot']);
    fetchMealPlanSuggestions.mockResolvedValue({
      suggestions: [chilli],
      pool: [chilli, pasta, beetroot],
    });

    const user = userEvent.setup();
    renderWizard();
    await start(user);

    const swapOnce = async () => user.click(screen.getByRole('button', { name: 'Swap' }));

    await swapOnce();
    expect(screen.getByText('Pasta')).toBeInTheDocument();

    await swapOnce();
    expect(screen.getByText('Beetroot')).toBeInTheDocument();

    // Everything is now rejected; the oldest rejection (Chilli) comes back.
    await swapOnce();
    expect(screen.getByText('Chilli')).toBeInTheDocument();

    // ...and the rotation continues rather than bouncing back to Beetroot.
    await swapOnce();
    expect(screen.queryByText('Beetroot')).not.toBeInTheDocument();
    expect(screen.getByText('Pasta')).toBeInTheDocument();
  });

  it('removes a suggestion', async () => {
    const user = userEvent.setup();
    renderWizard();
    await start(user);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    expect(screen.queryByText('Chilli')).not.toBeInTheDocument();
    expect(screen.getByText('Curry')).toBeInTheDocument();
  });

  it('adds another recipe from the pool', async () => {
    const user = userEvent.setup();
    renderWizard();
    await start(user);

    await user.click(screen.getByRole('button', { name: 'Add another' }));

    expect(screen.getByText('Pasta')).toBeInTheDocument();
  });
});

describe('review', () => {
  it('deduplicates ingredients across recipes and credits both', async () => {
    const user = userEvent.setup();
    renderWizard();
    await start(user);
    await user.click(screen.getByRole('button', { name: 'Review ingredients' }));

    expect(screen.getByText('Beans')).toBeInTheDocument();
    expect(screen.getByText('Chilli, Curry')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 items will be added.')).toBeInTheDocument();
  });

  it('excludes unticked ingredients on confirm', async () => {
    const user = userEvent.setup();
    renderWizard();
    await start(user);
    await user.click(screen.getByRole('button', { name: 'Review ingredients' }));

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: 'Add to list' }));

    await waitFor(() => expect(confirmMealPlan).toHaveBeenCalled());
    const [recipeIds, excluded] = confirmMealPlan.mock.calls[0];
    expect(recipeIds).toEqual([1, 2]);
    expect(excluded).toEqual([100, 201]); // Beans, from both recipes
  });

  it('shows the success screen and clears the draft', async () => {
    const user = userEvent.setup();
    renderWizard();
    await start(user);
    await user.click(screen.getByRole('button', { name: 'Review ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add to list' }));

    expect(await screen.findByText('3 items added to your list.')).toBeInTheDocument();
    expect(sessionStorage.getItem('mealplan_draft')).toBeNull();
  });
});

describe('recurring', () => {
  const milk = { id: 7, name: 'Milk', amount: '2L', category_id: null };
  const bread = { id: 8, name: 'Bread', amount: null, category_id: null };

  /** Land on the recurring step with Milk and Bread configured. */
  const toRecurring = async (user) => {
    renderWizard();
    await start(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
  };

  beforeEach(() => {
    useStore.setState({ recurringItems: [milk, bread] });
  });

  it('skips the step when there are no recurring items', async () => {
    useStore.setState({ recurringItems: [] });
    const user = userEvent.setup();
    renderWizard();
    await start(user);

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review ingredients' }));
    expect(screen.getByText('3 of 3 items will be added.')).toBeInTheDocument();
  });

  it('offers every recurring item unticked', async () => {
    const user = userEvent.setup();
    await toRecurring(user);

    expect(screen.getByText('Bread')).toBeInTheDocument();
    expect(screen.getByText('Milk')).toBeInTheDocument();
    screen.getAllByRole('checkbox').forEach((box) => expect(box).not.toBeChecked());
  });

  it('flags recurring items already on the list, ignoring checked ones', async () => {
    useStore.setState({
      items: [
        { id: 1, name: 'milk', checked: 0 },
        { id: 2, name: 'Bread', checked: 1 },
      ],
    });
    const user = userEvent.setup();
    await toRecurring(user);

    expect(screen.getAllByText('already on the list')).toHaveLength(1);
  });

  it('adds only the ticked recurring items on confirm', async () => {
    const user = userEvent.setup();
    await toRecurring(user);

    await user.click(screen.getByRole('checkbox', { name: /Milk/ }));
    await user.click(screen.getByRole('button', { name: 'Review ingredients' }));

    expect(screen.getByText('Recurring')).toBeInTheDocument();
    expect(screen.getByText('4 of 4 items will be added.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add to list' }));
    await waitFor(() => expect(confirmMealPlan).toHaveBeenCalled());
    expect(confirmMealPlan.mock.calls[0][2]).toEqual([7]);
  });

  it('merges a recurring item into the matching ingredient row', async () => {
    useStore.setState({ recurringItems: [{ id: 9, name: 'beans', amount: null }] });
    const user = userEvent.setup();
    await toRecurring(user);

    await user.click(screen.getByRole('checkbox', { name: /beans/ }));
    await user.click(screen.getByRole('button', { name: 'Review ingredients' }));

    expect(screen.getByText('Chilli, Curry, Recurring')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 items will be added.')).toBeInTheDocument();

    // Unticking the merged row drops both the ingredients and the recurring item.
    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: 'Add to list' }));
    await waitFor(() => expect(confirmMealPlan).toHaveBeenCalled());
    const [, excluded, recurringIds] = confirmMealPlan.mock.calls[0];
    expect(excluded).toEqual([100, 201]);
    expect(recurringIds).toEqual([]);
  });

  it('goes back from review to the recurring step', async () => {
    const user = userEvent.setup();
    await toRecurring(user);
    await user.click(screen.getByRole('button', { name: 'Review ingredients' }));

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('Tick the recurring items you need this week.')).toBeInTheDocument();
  });
});

describe('errors', () => {
  it('surfaces the store error message', async () => {
    const message = 'Dinner suggestions need a connection.';
    fetchMealPlanSuggestions.mockImplementation(async () => {
      useStore.setState((s) => ({ mealPlan: { ...s.mealPlan, error: message } }));
      throw new Error('offline');
    });

    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});
