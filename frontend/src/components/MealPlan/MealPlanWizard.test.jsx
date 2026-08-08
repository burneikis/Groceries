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
    expect(screen.getByText('3 of 3 ingredients will be added.')).toBeInTheDocument();
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

    expect(await screen.findByText('3 ingredients added to your list.')).toBeInTheDocument();
    expect(sessionStorage.getItem('mealplan_draft')).toBeNull();
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
