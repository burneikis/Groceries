import { useState } from 'react'
import useStore from '../../store/useStore'
import RecurringForm from './RecurringForm'

/** One recurring item in Settings: tap to edit inline, bin to delete. */
export default function RecurringRow({ recurring }) {
  const { categories, updateRecurringItem, deleteRecurringItem } = useStore()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const categoryName = categories.find((c) => c.id === recurring.category_id)?.name

  const handleSave = async (fields) => {
    await updateRecurringItem(recurring.id, fields)
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${recurring.name}"?`)) return
    setDeleting(true)
    try {
      await deleteRecurringItem(recurring.id)
    } catch (err) {
      alert(err.message)
      setDeleting(false)
    }
  }

  if (editing) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-3">
        <RecurringForm
          initial={recurring}
          onSubmit={handleSave}
          onCancel={() => setEditing(false)}
          submitLabel="Save"
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 px-3 py-2.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex-1 min-w-0 text-left"
      >
        <span className="text-sm text-gray-800 dark:text-slate-200">{recurring.name}</span>
        {recurring.amount && (
          <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">{recurring.amount}</span>
        )}
        <span className="block text-xs text-gray-400 dark:text-slate-500 truncate">
          {categoryName ?? 'No category'}
        </span>
      </button>

      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete ${recurring.name}`}
        className="p-1 text-gray-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-colors disabled:opacity-40"
      >
        {deleting
          ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
        }
      </button>
    </div>
  )
}
