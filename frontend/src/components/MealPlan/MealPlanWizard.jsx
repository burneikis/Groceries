import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useStore from '../../store/useStore'
import LoadingSpinner from '../LoadingSpinner'
import { sortRecurring } from '../../utils/recurring'
import {
  DRAFT_KEY,
  buildReviewList,
  lastCookedLabel,
  nextFromPool,
  onListChecker,
  rejectRecipe,
  reviewSources,
} from './mealPlanUtils'

const COUNT_OPTIONS = [3, 4, 5]

/** @returns {Set} a copy of `set` with `value` added or removed */
const toggleInSet = (set, value) => {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

const readDraft = () => {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) ?? null
  } catch {
    return null
  }
}

export default function MealPlanWizard() {
  const navigate = useNavigate()
  const {
    items,
    categories,
    recurringItems,
    mealPlan,
    isOnline,
    fetchMealPlanSuggestions,
    fetchRecurringItems,
    confirmMealPlan,
  } = useStore()

  const draft = readDraft()
  const [step, setStep] = useState(draft?.step ?? 'intro')
  const [count, setCount] = useState(draft?.count ?? 4)
  const [selected, setSelected] = useState(draft?.selected ?? [])
  const [pool, setPool] = useState(draft?.pool ?? [])
  const [skipped, setSkipped] = useState(() => new Set(draft?.skipped ?? []))
  const [rejected, setRejected] = useState(() => new Set(draft?.rejected ?? []))
  const [pickedRecurring, setPickedRecurring] = useState(() => new Set(draft?.pickedRecurring ?? []))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    fetchRecurringItems()
  }, [fetchRecurringItems])

  // Persist enough to resume mid-wizard after a refresh.
  useEffect(() => {
    if (step === 'done') {
      sessionStorage.removeItem(DRAFT_KEY)
      return
    }
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step,
        count,
        selected,
        pool,
        skipped: [...skipped],
        rejected: [...rejected],
        pickedRecurring: [...pickedRecurring],
      })
    )
  }, [step, count, selected, pool, skipped, rejected, pickedRecurring])

  const load = async (wanted) => {
    setBusy(true)
    try {
      const { suggestions, pool: fresh } = await fetchMealPlanSuggestions(wanted)
      setSelected(suggestions)
      setPool(fresh)
      setSkipped(new Set())
      setRejected(new Set())
      setPickedRecurring(new Set())
      setStep('suggestions')
    } catch {
      // The error message lives in the store and is rendered below.
    } finally {
      setBusy(false)
    }
  }

  const swap = (recipeId) => {
    const replacement = nextFromPool(pool, selected, rejected)
    if (!replacement) return
    setSelected(selected.map((r) => (r.id === recipeId ? replacement : r)))
    setRejected((prev) => rejectRecipe(prev, recipeId))
  }

  const remove = (recipeId) => {
    setSelected(selected.filter((r) => r.id !== recipeId))
    setRejected((prev) => rejectRecipe(prev, recipeId))
  }

  const addAnother = () => {
    const extra = nextFromPool(pool, selected, rejected)
    if (extra) setSelected([...selected, extra])
  }

  const recurringOptions = sortRecurring(recurringItems, categories)
  const hasRecurring = recurringOptions.length > 0
  const isOnList = onListChecker(items)
  const picked = recurringOptions.filter((r) => pickedRecurring.has(r.id))

  const review = buildReviewList(selected, items, picked)
  const included = review.filter((entry) => !skipped.has(entry.key))

  const toggleIngredient = (key) => setSkipped((prev) => toggleInSet(prev, key))
  const toggleRecurring = (id) => setPickedRecurring((prev) => toggleInSet(prev, id))

  const confirm = async () => {
    setBusy(true)
    try {
      const excluded = review
        .filter((entry) => skipped.has(entry.key))
        .flatMap((entry) => entry.ingredientIds)
      const recurringIds = included.flatMap((entry) => entry.recurringIds)
      const res = await confirmMealPlan(selected.map((r) => r.id), excluded, recurringIds)
      setResult(res)
      setStep('done')
    } catch (err) {
      console.error('Failed to confirm meal plan:', err)
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    sessionStorage.removeItem(DRAFT_KEY)
    navigate('/recipes')
  }

  return (
    <div className="max-w-lg mx-auto px-4">
      <header className="py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
          What&apos;s for dinner?
        </h1>
        <button
          onClick={cancel}
          className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
        >
          {step === 'done' ? 'Close' : 'Cancel'}
        </button>
      </header>

      {mealPlan.error && step !== 'done' && (
        <p className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-4 py-3">
          {mealPlan.error}
        </p>
      )}

      {busy && <LoadingSpinner />}

      {step === 'intro' && !busy && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-slate-300">
            Plan this week&apos;s dinners from your regular recipes, then add every
            ingredient to the list in one go.
          </p>
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
              How many dinners?
            </p>
            <div className="flex gap-2">
              {COUNT_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => setCount(option)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${count === option
                    ? 'bg-amber-500 dark:bg-amber-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700'
                    }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => load(count)}
            disabled={!isOnline}
            className="w-full py-3 rounded-xl bg-amber-500 dark:bg-amber-600 text-white font-semibold disabled:opacity-40"
          >
            Start
          </button>
          {!isOnline && (
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center">
              Suggestions need a connection.
            </p>
          )}
        </div>
      )}

      {step === 'suggestions' && !busy && (
        <div className="space-y-3">
          {selected.length === 0 && (
            <p className="text-center text-gray-400 dark:text-slate-500 py-8">
              No regular recipes yet. Mark a few recipes as regulars first.
            </p>
          )}

          {selected.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100">{recipe.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    {(recipe.ingredients ?? []).length} ingredients ·{' '}
                    {lastCookedLabel(recipe.last_planned_at)}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => swap(recipe.id)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                  >
                    Swap
                  </button>
                  <button
                    onClick={() => remove(recipe.id)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <button
              onClick={addAnother}
              disabled={!nextFromPool(pool, selected, rejected)}
              className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-gray-700 dark:text-slate-300 disabled:opacity-40"
            >
              Add another
            </button>
            <button
              onClick={() => load(count)}
              className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium text-gray-700 dark:text-slate-300"
            >
              Reshuffle all
            </button>
          </div>

          <button
            onClick={() => setStep(hasRecurring ? 'recurring' : 'review')}
            disabled={selected.length === 0}
            className="w-full py-3 rounded-xl bg-amber-500 dark:bg-amber-600 text-white font-semibold disabled:opacity-40"
          >
            {hasRecurring ? 'Next' : 'Review ingredients'}
          </button>
        </div>
      )}

      {step === 'recurring' && !busy && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Tick the recurring items you need this week.
          </p>

          {recurringOptions.map((recurring) => (
            <label
              key={recurring.id}
              className="flex items-start gap-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-3"
            >
              <input
                type="checkbox"
                checked={pickedRecurring.has(recurring.id)}
                onChange={() => toggleRecurring(recurring.id)}
                className="mt-1 w-4 h-4 accent-amber-500"
              />
              <span className="min-w-0">
                <span className="block text-gray-900 dark:text-slate-100">
                  {recurring.name}
                  {recurring.amount && (
                    <span className="text-gray-500 dark:text-slate-400"> ({recurring.amount})</span>
                  )}
                </span>
                {isOnList(recurring.name) && (
                  <span className="block text-xs text-gray-500 dark:text-slate-400">
                    already on the list
                  </span>
                )}
              </span>
            </label>
          ))}

          <div className="flex gap-2">
            <button
              onClick={() => setStep('suggestions')}
              className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-slate-700 font-medium text-gray-700 dark:text-slate-300"
            >
              Back
            </button>
            <button
              onClick={() => setStep('review')}
              className="flex-1 py-3 rounded-xl bg-amber-500 dark:bg-amber-600 text-white font-semibold"
            >
              Review ingredients
            </button>
          </div>
        </div>
      )}

      {step === 'review' && !busy && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {included.length} of {review.length} items will be added.
          </p>

          {review.map((entry) => (
            <label
              key={entry.key}
              className="flex items-start gap-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-3"
            >
              <input
                type="checkbox"
                checked={!skipped.has(entry.key)}
                onChange={() => toggleIngredient(entry.key)}
                className="mt-1 w-4 h-4 accent-amber-500"
              />
              <span className="min-w-0">
                <span className="block text-gray-900 dark:text-slate-100">
                  {entry.name}
                  {entry.amounts.length > 0 && (
                    <span className="text-gray-500 dark:text-slate-400"> ({entry.amounts.join(' + ')})</span>
                  )}
                </span>
                <span className="block text-xs text-gray-500 dark:text-slate-400">
                  {reviewSources(entry)}
                  {entry.onList && ' · already on the list'}
                </span>
              </span>
            </label>
          ))}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(hasRecurring ? 'recurring' : 'suggestions')}
              className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-slate-700 font-medium text-gray-700 dark:text-slate-300"
            >
              Back
            </button>
            <button
              onClick={confirm}
              disabled={included.length === 0}
              className="flex-1 py-3 rounded-xl bg-amber-500 dark:bg-amber-600 text-white font-semibold disabled:opacity-40"
            >
              Add to list
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4 text-center py-8">
          <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            {result?.queued
              ? 'Saved. Your dinners will be added once you are back online.'
              : `${result?.itemsAdded ?? 0} items added to your list.`}
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 rounded-xl bg-amber-500 dark:bg-amber-600 text-white font-semibold"
          >
            Go to the list
          </Link>
        </div>
      )}
    </div>
  )
}
