import { useState } from 'react'
import useStore from '../../store/useStore'
import { itemsApi } from '../../services/api'
import { findRecurringClash } from '../../utils/recurring'

const INPUT =
  'px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-400'

/**
 * Name / quantity / category form shared by "add" and "edit" of a recurring item.
 *
 * @param {object} props
 * @param {object} [props.initial] - existing recurring item when editing
 * @param {(fields: object) => Promise<any>} props.onSubmit
 * @param {() => void} [props.onCancel] - shows a Cancel button when given
 * @param {string} props.submitLabel
 * @param {boolean} [props.resetOnSubmit] - clear the fields after a save (add mode)
 */
export default function RecurringForm({ initial, onSubmit, onCancel, submitLabel, resetOnSubmit = false }) {
  const { categories, recurringItems } = useStore()
  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState(initial?.amount ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const suggestCategory = async () => {
    if (!name.trim() || categoryId) return // never overwrite a chosen category
    try {
      const { category_id } = await itemsApi.suggestCategory(name.trim())
      if (category_id) setCategoryId(category_id)
    } catch {
      // A suggestion is a nicety; offline or failing is fine.
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    const clash = findRecurringClash(recurringItems, trimmed, initial?.id ?? null)
    if (clash) {
      setError(`"${clash.name}" is already a recurring item`)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name: trimmed,
        amount: amount.trim() || null,
        category_id: categoryId || null,
      })
      if (resetOnSubmit) {
        setName('')
        setAmount('')
        setCategoryId('')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
        onBlur={suggestCategory}
        placeholder="Recurring item, e.g. Milk"
        aria-label="Recurring item name"
        className={`w-full ${INPUT}`}
        autoFocus={Boolean(initial)}
      />
      <div className="flex gap-2">
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Qty"
          aria-label="Quantity"
          className={`w-24 ${INPUT}`}
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
          aria-label="Category"
          className={`flex-1 min-w-0 ${INPUT}`}
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 disabled:opacity-40"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="relative px-4 py-1.5 rounded-lg bg-amber-500 dark:bg-amber-600 text-white text-sm font-semibold hover:bg-amber-600 dark:hover:bg-amber-700 disabled:opacity-40 transition-colors"
        >
          <span className={saving ? 'invisible' : ''}>{submitLabel}</span>
          {saving && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </span>
          )}
        </button>
      </div>
    </form>
  )
}
